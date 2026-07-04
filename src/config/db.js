const dns = require("dns");
// Use public DNS to resolve MongoDB SRV records if local DNS fails
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const { db: dbConfig } = require("./index");

// Disable command buffering
mongoose.set("bufferCommands", false);

/**
 * Ensures a MongoDB URI contains a database name.
 * If one is already present, the URI is returned unchanged.
 */
const ensureDatabaseName = (uri, dbName) => {
  if (!uri) return uri;

  const hasDbName = /\/[^/?]+(\?|$)/.test(uri.split("?")[0]);

  if (hasDbName) {
    return uri;
  }

  const [base, query] = uri.split("?");

  return base.replace(/\/$/, "") + `/${dbName}` + (query ? `?${query}` : "");
};

/**
 * Connect to MongoDB with retry logic
 */
const connectDB = async (maxRetries = 5, initialDelay = 2000) => {
  let uri = dbConfig.uri;

  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set");
  }

  // Default database if URI doesn't specify one
  uri = ensureDatabaseName(uri, process.env.MONGO_DB_NAME || "file_management");

  const mongoOptions = {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, mongoOptions);

      console.log(`✓ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

      mongoose.connection.on("connected", () => {
        console.log("MongoDB: Connection established");
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB: Connection lost");
      });

      mongoose.connection.on("reconnected", () => {
        console.log("MongoDB: Reconnected successfully");
      });

      mongoose.connection.on("error", (err) => {
        console.error(`MongoDB: Connection error [${err.name}]:`, err.message);
      });

      mongoose.connection.on("close", () => {
        console.log("MongoDB: Connection closed");
      });

      return;
    } catch (error) {
      const delay = initialDelay * Math.pow(2, attempt - 1);

      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log("MongoDB disconnected");
};

// Per-DB tenancy mode: lazy connection cache
const tenantConnections = new Map();

const getTenantConnection = async (tenantId) => {
  if (tenantConnections.has(tenantId)) {
    return tenantConnections.get(tenantId);
  }

  let uri = dbConfig.uri;

  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set");
  }

  if (uri.includes("{tenant}")) {
    uri = uri.replace("{tenant}", tenantId);
  } else {
    uri = ensureDatabaseName(uri, tenantId);
  }

  const conn = await mongoose.createConnection(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 }).asPromise();

  tenantConnections.set(tenantId, conn);

  return conn;
};

module.exports = { connectDB, disconnectDB, getTenantConnection };
