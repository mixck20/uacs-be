const Inventory = require('../models/Inventory');
const Patient = require('../models/Patient');
const { sendLowStockAlert } = require('../utils/emailService');

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
    await item.remove();
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

    // Add to dispensing history
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

    const items = await Inventory.find()
      .populate('dispensingHistory.dispensedBy', 'name email role')
      .populate('dispensingHistory.patientId', 'fullName email studentId');

    let allRecords = [];
    
    items.forEach(item => {
      item.dispensingHistory.forEach(record => {
        allRecords.push({
          ...record.toObject(),
          itemId: item._id,
          itemName: item.name,
          itemCategory: item.category
        });
      });
    });

    // Filter by date range
    if (startDate || endDate) {
      allRecords = allRecords.filter(record => {
        const recordDate = new Date(record.dispensedAt);
        if (startDate && recordDate < new Date(startDate)) return false;
        if (endDate && recordDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by most recent first and limit
    allRecords = allRecords
      .sort((a, b) => new Date(b.dispensedAt) - new Date(a.dispensedAt))
      .slice(0, parseInt(limit));

    res.json({
      total: allRecords.length,
      records: allRecords
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

    const items = await Inventory.find();

    let totalDispensed = 0;
    let itemStats = [];

    items.forEach(item => {
      const recentDispensing = item.dispensingHistory.filter(
        record => new Date(record.dispensedAt) >= startDate
      );

      const totalQty = recentDispensing.reduce((sum, record) => sum + record.quantity, 0);
      
      if (totalQty > 0) {
        itemStats.push({
          itemId: item._id,
          itemName: item.name,
          category: item.category,
          totalDispensed: totalQty,
          timesDispensed: recentDispensing.length,
          currentStock: item.quantity,
          isLowStock: item.quantity <= item.minQuantity
        });
        totalDispensed += totalQty;
      }
    });

    // Sort by most dispensed
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