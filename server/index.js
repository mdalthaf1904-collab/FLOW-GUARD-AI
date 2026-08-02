/**
 * FlowGuard AI - Express.js Server Entrypoint
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS & JSON Parsing Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// REST API Gateway
app.use('/api', apiRoutes);

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname, '..')));

// Default status endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'FlowGuard AI Backend Engine', version: '2.0.0' });
});

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`   FLOWGUARD AI - EXPRESS BACKEND       `);
  console.log(`========================================`);
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`API Gateway:       http://localhost:${PORT}/api`);
  console.log(`========================================`);
});
