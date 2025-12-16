const mongoose = require('mongoose');
const eventBus = require('../utils/eventBus');
const logger = require('../utils/logger');

/**
 * Start change streams for models to broadcast DB-level changes (cross-process)
 * - Watches the User model and emits `user:updated` / `user:deleted` to rooms and eventBus
 * Notes:
 * - Requires MongoDB replica set for change streams. If not available, this will fail gracefully.
 */
function startChangeStreams() {
  try {
    if (!mongoose || !mongoose.model) {
      logger.warn('Mongoose not available for change streams');
      return;
    }

    const User = mongoose.model('User');
    if (!User || typeof User.watch !== 'function') {
      logger.warn('User model does not support change streams');
      return;
    }

    logger.info('Starting change stream for User model');

    const changeStream = User.watch([], { fullDocument: 'updateLookup' });

    changeStream.on('change', (change) => {
      try {
        // fullDocument present for insert/update/replace when updateLookup used
        if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
          const doc = change.fullDocument;
          if (!doc) return;

          // sanitize
          let userObj = (typeof doc.toObject === 'function') ? doc.toObject({ getters: true }) : JSON.parse(JSON.stringify(doc));
          if (userObj && typeof userObj === 'object') {
            delete userObj.password;
            delete userObj.__v;
          }

          // emit on eventBus (local listeners) and via io to user room (if available)
          try {
            if (eventBus && eventBus.bus && typeof eventBus.bus.emit === 'function') {
              eventBus.bus.emit('user:updated', userObj);
            }
            const io = eventBus.getIO && eventBus.getIO();
            if (io) io.to(`user:${doc._id}`).emit('user:updated', userObj);
          } catch (e) {
            logger.warn('Failed to emit user change:', e.message);
          }
        } else if (change.operationType === 'delete') {
          const id = change.documentKey && change.documentKey._id;
          if (!id) return;
          try {
            if (eventBus && eventBus.bus && typeof eventBus.bus.emit === 'function') {
              eventBus.bus.emit('user:deleted', { id });
            }
            const io = eventBus.getIO && eventBus.getIO();
            if (io) io.to(`user:${id}`).emit('user:deleted', { id });
          } catch (e) {
            logger.warn('Failed to emit user delete change:', e.message);
          }
        }
      } catch (err) {
        logger.warn('Error handling user change stream event:', err.message);
      }
    });

    changeStream.on('error', (err) => {
      logger.warn('User changeStream error:', err && err.message ? err.message : err);
    });

    // keep reference to close later if needed
    startChangeStreams._userStream = changeStream;
  } catch (e) {
    logger.warn('Change streams not available or failed to start:', e && e.message ? e.message : e);
  }
}

function stopChangeStreams() {
  try {
    if (startChangeStreams._userStream && typeof startChangeStreams._userStream.close === 'function') {
      startChangeStreams._userStream.close();
      startChangeStreams._userStream = null;
    }
  } catch (e) {
    // ignore
  }
}

module.exports = { startChangeStreams, stopChangeStreams };
