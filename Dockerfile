# ClawSocial Docker Image
# Production-ready social media automation platform

FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY dist ./dist

# Create directories for persistent data
RUN mkdir -p /app/sessions /app/browser-data /app/logs

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3847
ENV WS_PORT=3848
ENV HOST=0.0.0.0
ENV BROWSER_HEADLESS=true
ENV BROWSER_DATA_DIR=/app/browser-data
ENV SESSION_DIR=/app/sessions
ENV LOG_LEVEL=info
ENV LOG_FILE=/app/logs/clawsocial.log

# Expose ports
EXPOSE 3847 3848

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3847/health || exit 1

# Run as non-root user
USER pwuser

# Start server
CMD ["node", "dist/index.js"]
