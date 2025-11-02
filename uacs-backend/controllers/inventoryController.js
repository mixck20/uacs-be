const Inventory = require('../models/Inventory');
const Patient = require('../models/Patient');
const DispensingRecord = require('../models/DispensingRecord');
const { sendLowStockAlert, sendExpiringMedicineAlert } = require('../utils/emailService');
const { createAuditLog } = require('../middleware/auditLogger');

exports.getAllItems = async (req, res) => {
  try {
    const query = {};
    if (req.query.lowStock === '1') {
      query.quantity = { $lte: '$minQuantity' };
    }
    const items = await Inventory.find(query);
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createItem = async (req, res) => {
  const item = new Inventory(req.body);
  try {
    const newItem = await item.save();
    
    // Check if the item is expiring soon and send alert
    if (newItem.expiryDate && newItem.category === 'Medicine') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((newItem.expiryDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
        try {
          await sendExpiringMedicineAlert({
            itemName: newItem.name,
            expiryDate: newItem.expiryDate,
            daysUntilExpiry,
            currentQuantity: newItem.quantity,
            category: newItem.category,
            itemId: newItem._id
          });
          console.log(`Expiring medicine alert sent for newly added item: ${newItem.name}`);
        } catch (emailError) {
          console.error('Failed to send expiring medicine alert:', emailError);
          // Don't fail the creation if email fails
        }
      }
    }
    
    // Log inventory item creation
    await createAuditLog({
      user: req.user,
      action: 'CREATE',
      resource: 'Inventory',
      resourceId: newItem._id.toString(),
      description: `Created inventory item: ${newItem.name} (${newItem.category}, Qty: ${newItem.quantity})`,
      req,
      status: 'SUCCESS'
    });
    
    res.status(201).json(newItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    Object.assign(item, req.body);
    const updatedItem = await item.save();
    
    // Check if the updated item is expiring soon and send alert
    if (updatedItem.expiryDate && updatedItem.category === 'Medicine') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((updatedItem.expiryDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
        try {
          await sendExpiringMedicineAlert({
            itemName: updatedItem.name,
            expiryDate: updatedItem.expiryDate,
            daysUntilExpiry,
            currentQuantity: updatedItem.quantity,
            category: updatedItem.category,
            itemId: updatedItem._id
          });
          console.log(`Expiring medicine alert sent for updated item: ${updatedItem.name}`);
        } catch (emailError) {
          console.error('Failed to send expiring medicine alert:', emailError);
          // Don't fail the update if email fails
        }
      }
    }
    
    // Log inventory item update
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'Inventory',
      resourceId: updatedItem._id.toString(),
      description: `Updated inventory item: ${updatedItem.name} (${updatedItem.category}, Qty: ${updatedItem.quantity})`,
      changes: { updates: req.body },
      req,
      status: 'SUCCESS'
    });
    
    res.json(updatedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const itemInfo = {
      id: item._id.toString(),
      name: item.name,
      category: item.category,
      quantity: item.quantity
    };
    
    await item.deleteOne();
    
    // Log inventory item deletion
    await createAuditLog({
      user: req.user,
      action: 'DELETE',
      resource: 'Inventory',
      resourceId: itemInfo.id,
      description: `Deleted inventory item: ${itemInfo.name} (${itemInfo.category}, Qty: ${itemInfo.quantity})`,
      req,
      status: 'SUCCESS'
    });
    
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Dispense medicine/item
exports.dispenseItem = async (req, res) => {
  try {
    const { itemId, quantity, patientName, studentId, patientId, reason, notes, appointmentId } = req.body;
    
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Invalid dispensing data' });
    }

    const item = await Inventory.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if sufficient quantity
    if (item.quantity < quantity) {
      return res.status(400).json({ 
        message: `Insufficient stock. Available: ${item.quantity}, Requested: ${quantity}` 
      });
    }

    // Deduct quantity
    item.quantity -= quantity;
    const stockAfterDispensing = item.quantity;

    // Add to dispensing history (kept for backward compatibility)
    item.dispensingHistory.push({
      patientName,
      studentId,
      patientId,
      quantity,
      dispensedBy: req.user.id || req.user._id,
      appointmentId,
      reason,
      notes,
      dispensedAt: new Date()
    });

    await item.save();

    // Create permanent dispensing record in separate collection
    const dispensingRecord = new DispensingRecord({
      itemId: item._id,
      itemName: item.name,
      itemCategory: item.category,
      patientName,
      patientId,
      quantity,
      dispensedBy: req.user.id || req.user._id,
      appointmentId,
      reason,
      notes,
      stockAfterDispensing,
      dispensedAt: new Date()
    });
    await dispensingRecord.save();

    // Populate the dispensed by user info
    await item.populate('dispensingHistory.dispensedBy', 'name email');

    // Check if stock is low and send email alert
    if (item.quantity <= item.minQuantity) {
      try {
        await sendLowStockAlert({
          itemName: item.name,
          currentQuantity: item.quantity,
          minQuantity: item.minQuantity,
          category: item.category
        });
        console.log(`Low stock alert sent for ${item.name}`);
      } catch (emailError) {
        console.error('Failed to send low stock alert:', emailError);
        // Don't fail the dispensing if email fails
      }
    }

    // Log inventory item dispensing
    await createAuditLog({
      user: req.user,
      action: 'UPDATE',
      resource: 'Inventory',
      resourceId: item._id.toString(),
      description: `Dispensed ${quantity} units of ${item.name} to ${patientName}${reason ? ` (${reason})` : ''}`,
      changes: { quantityDispensed: quantity, stockAfter: item.quantity },
      req,
      status: 'SUCCESS'
    });

    res.json({ 
      message: 'Item dispensed successfully',
      item,
      lowStockAlert: item.quantity <= item.minQuantity
    });
  } catch (error) {
    console.error('Dispense error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get dispensing history for an item
exports.getDispensingHistory = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;

    const item = await Inventory.findById(itemId)
      .populate('dispensingHistory.dispensedBy', 'name email role')
      .populate('dispensingHistory.patientId', 'fullName email studentId');

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    let history = item.dispensingHistory;

    // Filter by date range if provided
    if (startDate || endDate) {
      history = history.filter(record => {
        const recordDate = new Date(record.dispensedAt);
        if (startDate && recordDate < new Date(startDate)) return false;
        if (endDate && recordDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by most recent first and limit
    history = history
      .sort((a, b) => new Date(b.dispensedAt) - new Date(a.dispensedAt))
      .slice(0, parseInt(limit));

    res.json({
      itemName: item.name,
      currentStock: item.quantity,
      history
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all dispensing records across all items
exports.getAllDispensingRecords = async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;

    // Build query
    const query = {};
    if (startDate || endDate) {
      query.dispensedAt = {};
      if (startDate) query.dispensedAt.$gte = new Date(startDate);
      if (endDate) query.dispensedAt.$lte = new Date(endDate);
    }

    // Get records from separate collection (permanent records)
    const records = await DispensingRecord.find(query)
      .populate('dispensedBy', 'name email role')
      .populate('patientId', 'firstName lastName email')
      .populate('itemId', 'name quantity')
      .sort({ dispensedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      total: records.length,
      records
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get dispensing statistics
exports.getDispensingStats = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get records from permanent collection
    const records = await DispensingRecord.find({
      dispensedAt: { $gte: startDate }
    }).populate('itemId', 'name quantity minQuantity category');

    // Group by item
    const itemStatsMap = {};
    let totalDispensed = 0;

    records.forEach(record => {
      const itemId = record.itemId?._id?.toString() || record.itemId?.toString();
      
      if (!itemStatsMap[itemId]) {
        itemStatsMap[itemId] = {
          itemId: itemId,
          itemName: record.itemName,
          category: record.itemCategory,
          totalDispensed: 0,
          timesDispensed: 0,
          currentStock: record.itemId?.quantity || 0,
          isLowStock: record.itemId ? record.itemId.quantity <= record.itemId.minQuantity : false
        };
      }

      itemStatsMap[itemId].totalDispensed += record.quantity;
      itemStatsMap[itemId].timesDispensed += 1;
      totalDispensed += record.quantity;
    });

    // Convert to array and sort
    const itemStats = Object.values(itemStatsMap);
    itemStats.sort((a, b) => b.totalDispensed - a.totalDispensed);

    res.json({
      period: `${period} days`,
      totalDispensed,
      itemsDispensed: itemStats.length,
      topItems: itemStats.slice(0, 10),
      lowStockItems: itemStats.filter(item => item.isLowStock)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get items expiring soon
exports.getExpiringItems = async (req, res) => {
  try {
    const { days = 30 } = req.query; // Default to 30 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));
    futureDate.setHours(23, 59, 59, 999);

    // Find items with expiry date between today and future date
    const expiringItems = await Inventory.find({
      expiryDate: {
        $gte: today,
        $lte: futureDate
      }
    }).sort({ expiryDate: 1 }); // Sort by expiry date ascending

    // Calculate days until expiry for each item
    const itemsWithDays = expiringItems.map(item => {
      const daysUntilExpiry = Math.ceil((item.expiryDate - today) / (1000 * 60 * 60 * 24));
      return {
        ...item.toObject(),
        daysUntilExpiry,
        urgencyLevel: daysUntilExpiry <= 7 ? 'urgent' : daysUntilExpiry <= 30 ? 'warning' : 'notice'
      };
    });

    res.json({
      total: itemsWithDays.length,
      items: itemsWithDays
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check and send expiring medicine alerts
exports.checkExpiringMedicines = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check for items expiring within 30 days
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    
    const expiringItems = await Inventory.find({
      expiryDate: {
        $gte: today,
        $lte: futureDate
      },
      category: 'Medicine' // Only check medicines
    }).sort({ expiryDate: 1 });

    let emailsSent = 0;
    const errors = [];

    for (const item of expiringItems) {
      const daysUntilExpiry = Math.ceil((item.expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Send email for items expiring within 30 days, 7 days, or 1 day
      if (daysUntilExpiry <= 30) {
        try {
          await sendExpiringMedicineAlert({
            itemName: item.name,
            expiryDate: item.expiryDate,
            daysUntilExpiry,
            currentQuantity: item.quantity,
            category: item.category,
            itemId: item._id
          });
          emailsSent++;
        } catch (emailError) {
          console.error(`Failed to send alert for ${item.name}:`, emailError);
          errors.push({ item: item.name, error: emailError.message });
        }
      }
    }

    res.json({
      message: 'Expiring medicine check completed',
      totalExpiringItems: expiringItems.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error checking expiring medicines:', error);
    res.status(500).json({ message: error.message });
  }
};