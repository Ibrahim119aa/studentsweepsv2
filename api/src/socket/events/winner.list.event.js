const Transaction = require('../../models/Transaction');

module.exports = (io, socket) => {
  socket.on('winners:list', async (payload) => {
    try {
      // Get all winning transactions, populated with user info
      const allWinners = await Transaction.find({
        category: 'order',
        'order.isWinner': true,
        'order.status': 'drawnWinner'
      })
        .sort({ 'order.dateTimestamp': -1 })
        .populate('user')
        .lean();
      
      // Deduplicate by prize name - only keep the most recent winner per prize
      // Use MongoDB aggregation to ensure proper deduplication
      const uniqueWinnersMap = new Map();
      
      // Group by prize name and get the most recent winner for each prize
      const prizeGroups = {};
      allWinners.forEach(winner => {
        const prizeName = winner.order?.prizeName;
        if (!prizeName) return;
        
        if (!prizeGroups[prizeName]) {
          prizeGroups[prizeName] = [];
        }
        prizeGroups[prizeName].push(winner);
      });
      
      // For each prize, keep only the most recent winner
      Object.keys(prizeGroups).forEach(prizeName => {
        const winners = prizeGroups[prizeName];
        // Sort by date (most recent first)
        winners.sort((a, b) => {
          const dateA = new Date(a.order?.dateTimestamp || a.createdAt || 0).getTime();
          const dateB = new Date(b.order?.dateTimestamp || b.createdAt || 0).getTime();
          return dateB - dateA; // Descending order
        });
        // Keep only the first (most recent) winner
        uniqueWinnersMap.set(prizeName, winners[0]);
      });
      
      const winners = Array.from(uniqueWinnersMap.values());
      
      console.log(`[winners:list] Found ${allWinners.length} total winner transactions, ${winners.length} unique winners (one per prize)`);
      socket.emit('winners:list:response', { success: true, results: winners });
    } catch (err) {
      console.error('[winners:list] Error:', err);
      socket.emit('winners:list:response', { success: false, message: err.message });
    }
  });
};
