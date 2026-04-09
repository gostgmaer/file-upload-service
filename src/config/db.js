const mongoose = require('mongoose');
const { db: dbConfig } = require('./index');

// Disable command buffering - ensures operations fail immediately if not connected
// instead of timing out silently after 10s.
mongoose.set('bufferCommands', false);

/**
 * Connect to MongoDB with retry logic and event listeners
 * Implements exponential backoff for transient connection failures
 */
const connectDB = async (maxRetries = 5, initialDelay = 2000) => {
  const uri = dbConfig.uri;
  if (!uri) throw new Error('MONGO_URI environment variable is not set');

  const mongoOptions = {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  };

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, mongoOptions);
      console.log(`✓ MongoDB connected: ${mongoose.connection.host}`);

      // Setup connection event listeners for monitoring
      mongoose.connection.on('connected', () => {
        console.log('MongoDB: Connection established');
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB: Connection lost');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB: Reconnected successfully');
      });

      mongoose.connection.on('error', (err) => {
        console.error(`MongoDB: Connection error [${err.name}]:`, err.message);
        if (err.name === 'MongooseServerSelectionError') {
          console.error('Hint: Check if the MongoDB host is reachable and the IP is whitelisted.');
        }
      });

      mongoose.connection.on('close', () => {
        console.log('MongoDB: Connection closed');
      });

      return; // Success - exit retry loop
    } catch (error) {
      const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.error(
        `MongoDB connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );

      if (attempt < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('MongoDB: All connection attempts failed');
        throw new Error(
          `Failed to connect to MongoDB after ${maxRetries} attempts: ${error.message}`
        );
      }
    }
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
};

// Per-DB tenancy mode: lazy connection cache
const tenantConnections = new Map();

const getTenantConnection = async (tenantId) => {
  if (tenantConnections.has(tenantId)) return tenantConnections.get(tenantId);

  const baseUri = dbConfig.uri;
  if (!baseUri) throw new Error('MONGO_URI environment variable is not set');

  const uri = baseUri.replace('{tenant}', tenantId);
  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();

  tenantConnections.set(tenantId, conn);
  return conn;
};

module.exports = { connectDB, disconnectDB, getTenantConnection };
