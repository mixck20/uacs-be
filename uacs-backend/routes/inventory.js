const express = require('express');
const router = express.Router();
const { isAuthenticated, isClinic } = require('../middleware/auth');
const inventoryController = require('../controllers/inventoryController');

router.use(isAuthenticated);
router.use(isClinic);

router.route('/')
  .get(inventoryController.getAllItems)
  .post(inventoryController.createItem);

router.route('/:id')
  .get(inventoryController.getItem)
  .put(inventoryController.updateItem)
  .delete(inventoryController.deleteItem);

// Dispensing routes
router.post('/dispense', inventoryController.dispenseItem);
router.get('/dispensing/history/:itemId', inventoryController.getDispensingHistory);
router.get('/dispensing/records', inventoryController.getAllDispensingRecords);
router.get('/dispensing/stats', inventoryController.getDispensingStats);

module.exports = router;