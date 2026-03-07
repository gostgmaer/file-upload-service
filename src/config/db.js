const mongoose = require('mongoose');
const { db: dbConfig } = require('./index');

const connectDB = async () => {
  const uri = dbConfig.uri;
  if (!uri) throw new Error('MONGO_URI environment variable is not set');

  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  console.log(`MongoDB connected: ${mongoose.connection.host}`);
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
