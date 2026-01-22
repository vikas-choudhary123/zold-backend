const express = require('express');
const router = express.Router();
const goldController = require('../controllers/goldController');
const { authMiddleware, roleMiddleware } = require('../middlewares/authMiddleware');

// Test Wallet Routes (requires authentication)
router.get('/test-wallet', authMiddleware, goldController.getTestWallet);
router.post('/test-wallet/add-credits', authMiddleware, goldController.addTestCredits);
router.post('/test-wallet/reset', authMiddleware, goldController.resetTestWallet);

// Gold Rate Routes
router.get('/rates/current', goldController.getCurrentGoldRate);
router.post('/rates', authMiddleware, roleMiddleware('ADMIN'), goldController.updateGoldRate);
router.get('/rates/history', authMiddleware, goldController.getGoldRateHistory);

// Buy Gold Routes  
router.post('/buy', authMiddleware, goldController.buyGold);

// Sell Gold Routes
router.post('/sell', authMiddleware, goldController.sellGold);

// Transaction History Routes
router.get('/transactions', authMiddleware, goldController.getTransactionHistory);
router.get('/transactions/all', authMiddleware, roleMiddleware('ADMIN'), goldController.getAllTransactionHistory);

// Wallet Balance Routes
router.get('/wallet/balance', authMiddleware, goldController.getUserWalletBalance);
router.get('/wallet/stats', authMiddleware, goldController.getWalletStats);

module.exports = router;
