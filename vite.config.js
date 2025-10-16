// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public', // Set the root to the 'public' directory
  server: {
    port: 3000, // You can specify the port here
    open: true // Automatically open the browser on server start
  }
});