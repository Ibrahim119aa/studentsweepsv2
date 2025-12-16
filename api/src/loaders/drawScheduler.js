const Prize = require('../models/Prize');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getIO } = require('../utils/eventBus');
const { faker } = require('@faker-js/faker');

async function loadSettings() {
  try {
    const settingsPath = path.resolve(__dirname, '..', 'config', 'settings.json');
    const raw = await fs.promises.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// pick a random winner from paid transactions for a prize
async function pickWinnerForPrize(prize) {
  if (!prize) return null;
  const trx = await Transaction.find({ category: 'order', 'order.prizeName': prize.name, 'order.isPaid': true }).populate('user').lean();
  if (!trx || trx.length === 0) return null;
  const winnerTrx = trx[Math.floor(Math.random() * trx.length)];
  return winnerTrx;
}

async function runOnce(io) {
  const now = new Date();
  try {
    const duePrizes = await Prize.find({ status: 'active', drawTimestamp: { $lte: now } });
    if (!duePrizes || duePrizes.length === 0) return;

    for (const prize of duePrizes) {
      try {
        // mark as drawn first to avoid double-processing
        prize.status = 'drawn';
        await prize.save();

        // load settings to check bot chance
        const settings = await loadSettings();
        const botChance = (settings && settings.draw && typeof settings.draw.botChance === 'number') ? settings.draw.botChance : 0;

        // decide whether this draw yields a bot winner
        const isBot = Math.random() < (Number(botChance) || 0);

        if (isBot) {
          // create a realistic-looking bot winner using faker
          const botId = `BOT-${Date.now()}${Math.floor(Math.random() * 9000) + 1000}`;
          const botName = faker.person.fullName();
          const nameParts = botName.split(' ');
          const botEmail = faker.internet.email({ firstName: nameParts[0] || 'bot', lastName: nameParts[1] || '' });
          const botAvatar = faker.image.avatar();
          const botCountry = faker.location.country();
          const botBio = faker.person.bio ? faker.person.bio() : faker.lorem.sentence();

          const mockWinner = {
            _id: mongoose.Types.ObjectId(),
            trxID: `BOTTRX-${botId}`,
            user: null,
            order: {
              prizeName: prize.name,
              dateTimestamp: new Date(),
              status: 'drawnWinner',
              isWinner: true,
              isPaid: true,
              isBot: true,
              user: null
            },
            bot: { id: botId, name: botName, emailAddress: botEmail, avatar: botAvatar, country: botCountry, bio: botBio }
          };

          // persist a transaction record for bookkeeping
          try {
            await Transaction.create({
              trxID: mockWinner.trxID,
              user: null,
              category: 'order',
              order: Object.assign({}, mockWinner.order, { entries: { amount: 0, costPerEntry: 0, totalCost: 0, entryNumbers: [] } })
            });
          } catch (e) {
            logger.warn('drawScheduler.bot.transactionCreateFailed', { err: e.message });
          }

          const ioRef = getIO() || io;
          ioRef.emit('draw:result', { success: true, prize: prize._id, winner: mockWinner, isBot: true });
          continue;
        }

        const winner = await pickWinnerForPrize(prize);
        if (!winner) {
          (getIO() || io).emit('draw:result', { success: false, message: 'no eligible entries', prize: prize._id });
          continue;
        }

        // mark transaction as winner
        try {
          await Transaction.findByIdAndUpdate(winner._id, { $set: { 'order.isWinner': true, 'order.status': 'drawnWinner' } });
        } catch (e) {
          // ignore
        }

        (getIO() || io).emit('draw:result', { success: true, prize: prize._id, winner });
      } catch (prizeErr) {
        logger.error('drawScheduler.prizeError', { prizeId: prize._id, err: prizeErr.message });
      }
    }
  } catch (err) {
    logger.error('drawScheduler.error', { message: err.message });
  }
}

let intervalHandle = null;

function start(io) {
  const ms = parseInt(process.env.DRAW_CHECK_INTERVAL_MS || '60000', 10);
  if (intervalHandle) return;
  // run immediately then set interval
  runOnce(io).catch((e) => console.error('drawScheduler initial run error', e.message));
  intervalHandle = setInterval(() => runOnce(io), ms);
  console.log(`🔔 Draw scheduler started (interval ${ms}ms)`);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop };
