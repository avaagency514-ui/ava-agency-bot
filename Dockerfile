FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies first
COPY multimetachanger/requirements.txt ./multimetachanger/
RUN pip install --no-cache-dir -r multimetachanger/requirements.txt

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Cache bust - force rebuild of code layer
ARG CACHEBUST=3
# Copy all source code
COPY . .

# Expose ports
ENV PORT=8080
EXPOSE 8080 5000

# Make start script executable
RUN chmod +x start.sh

# Start both services
CMD ["./start.sh"]
