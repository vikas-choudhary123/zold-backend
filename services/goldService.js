const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

/**
 * Get or create test wallet for user
 */
const getTestWallet = async (userId) => {
  let testWallet = await prisma.testWallet.findUnique({
    where: { userId }
  });

  if (!testWallet) {
    testWallet = await prisma.testWallet.create({
      data: {
        userId,
        virtualBalance: 10000
      }
    });
  }

  return testWallet;
};

/**
 * Add virtual credits to test wallet
 */
const addTestCredits = async (userId, amount = 10000) => {
  const testWallet = await getTestWallet(userId);
  
  const updatedWallet = await prisma.testWallet.update({
    where: { userId },
    data: {
      virtualBalance: {
        increment: amount
      }
    }
  });

  return updatedWallet;
};

/**
 * Reset test wallet to default balance
 */
const resetTestWallet = async (userId) => {
  const testWallet = await getTestWallet(userId);
  
  const updatedWallet = await prisma.testWallet.update({
    where: { userId },
    data: {
      virtualBalance: 10000
    }
  });

  return updatedWallet;
};

/**
 * Get current active gold rate
 */
const getCurrentGoldRate = async () => {
  let goldRate = await prisma.goldRate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });

  // If no rate exists, create a default one
  if (!goldRate) {
    goldRate = await prisma.goldRate.create({
      data: {
        buyRate: 6245.50,
        sellRate: 6145.50,
        isActive: true
      }
    });
  }

  return goldRate;
};

/**
 * Update gold rate (Admin only)
 */
const updateGoldRate = async (buyRate, sellRate, userId) => {
  // Mark all existing rates as inactive
  await prisma.goldRate.updateMany({
    where: { isActive: true },
    data: { isActive: false }
  });

  // Create new active rate
  const newRate = await prisma.goldRate.create({
    data: {
      buyRate: parseFloat(buyRate),
      sellRate: parseFloat(sellRate),
      isActive: true,
      createdBy: userId
    }
  });

  return newRate;
};

/**
 * Get gold rate history
 */
const getGoldRateHistory = async (limit = 10) => {
  const history = await prisma.goldRate.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return history;
};

/**
 * Buy gold using test wallet
 */
const buyGold = async (userId, data) => {
  const { amountInRupees, goldGrams, storageType, paymentMode = 'TEST_WALLET' } = data;

  // Get current gold rate
  const goldRate = await getCurrentGoldRate();

  // Calculate amounts
  const totalAmount = parseFloat(amountInRupees);
  const gst = totalAmount * 0.03; // 3% GST
  const finalAmount = totalAmount + gst;

  // Check test wallet balance
  const testWallet = await getTestWallet(userId);
  if (parseFloat(testWallet.virtualBalance) < finalAmount) {
    throw new Error('Insufficient test wallet balance');
  }

  // Start transaction
  const result = await prisma.$transaction(async (tx) => {
    // Deduct from test wallet
    const updatedTestWallet = await tx.testWallet.update({
      where: { userId },
      data: {
        virtualBalance: {
          decrement: finalAmount
        }
      }
    });

    // Get or create user wallet
    let wallet = await tx.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          userId,
          goldBalance: 0,
          rupeeBalance: 0
        }
      });
    }

    // Add gold to wallet
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        goldBalance: {
          increment: parseFloat(goldGrams)
        }
      }
    });

    // Create transaction record
    const transaction = await tx.goldTransaction.create({
      data: {
        userId,
        type: 'BUY',
        goldGrams: parseFloat(goldGrams),
        ratePerGram: goldRate.buyRate,
        totalAmount,
        gst,
        finalAmount,
        paymentMode,
        status: 'COMPLETED',
        storageType: storageType || 'vault'
      }
    });

    return {
      transaction,
      updatedWallet,
      updatedTestWallet
    };
  });

  return result;
};

/**
 * Get user's transaction history
 */
const getTransactionHistory = async (userId, limit = 20) => {
  const transactions = await prisma.goldTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return transactions;
};

/**
 * Get all transaction history (Admin only)
 */
const getAllTransactionHistory = async (limit = 50) => {
  const transactions = await prisma.goldTransaction.findMany({
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return transactions;
};

/**
 * Get user's complete wallet balance
 */
const getUserWalletBalance = async (userId) => {
  // Get or create wallet
  let wallet = await prisma.wallet.findUnique({
    where: { userId }
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        goldBalance: 0,
        rupeeBalance: 0
      }
    });
  }

  // Get recent transactions (last 5)
  const recentTransactions = await prisma.goldTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  // Get current gold rate
  const currentRate = await getCurrentGoldRate();

  // Calculate current value
  const currentValue = parseFloat(wallet.goldBalance) * parseFloat(currentRate.buyRate);

  return {
    goldBalance: wallet.goldBalance,
    rupeeBalance: wallet.rupeeBalance,
    currentValue,
    currentRate: currentRate.buyRate,
    recentTransactions
  };
};

/**
 * Get wallet statistics and calculations
 */
const getWalletStats = async (userId) => {
  // Get all user transactions
  const transactions = await prisma.goldTransaction.findMany({
    where: { 
      userId,
      type: 'BUY'
    },
    orderBy: { createdAt: 'desc' }
  });

  if (transactions.length === 0) {
    return {
      totalBought: 0,
      totalSold: 0,
      avgBuyPrice: 0,
      profitLoss: 0,
      profitLossPercent: 0
    };
  }

  // Calculate total gold bought
  const totalBought = transactions.reduce((sum, tx) => sum + parseFloat(tx.goldGrams), 0);

  // Calculate average buy price (weighted by amount)
  const totalSpent = transactions.reduce((sum, tx) => sum + parseFloat(tx.totalAmount), 0);
  const avgBuyPrice = totalSpent / totalBought;

  // Get current rate
  const currentRate = await getCurrentGoldRate();
  const currentPrice = parseFloat(currentRate.buyRate);

  // Get current wallet balance
  const wallet = await prisma.wallet.findUnique({
    where: { userId }
  });

  const currentGoldBalance = wallet ? parseFloat(wallet.goldBalance) : 0;

  // Calculate profit/loss
  const currentValue = currentGoldBalance * currentPrice;
  const investedValue = currentGoldBalance * avgBuyPrice;
  const profitLoss = currentValue - investedValue;
  const profitLossPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;

  return {
    totalBought,
    totalSold: 0, // TODO: Implement when sell is added
    avgBuyPrice,
    profitLoss,
    profitLossPercent
  };
};

module.exports = {
  getTestWallet,
  addTestCredits,
  resetTestWallet,
  getCurrentGoldRate,
  updateGoldRate,
  getGoldRateHistory,
  buyGold,
  getTransactionHistory,
  getAllTransactionHistory,
  getUserWalletBalance,
  getWalletStats
};
