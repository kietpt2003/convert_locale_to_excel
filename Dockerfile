# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies including devDependencies for build
RUN yarn install --frozen-lockfile

# Copy all source code
COPY . .

# Stage 2: Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ARG BLOB_READ_WRITE_TOKEN
ARG DB_USER
ARG DB_USER_PASSWORD
ARG DB_CLUSTER_PATH
ARG DB_NAME
ARG GOOGLE_CLIENT_ID
ARG JWT_SECRET
ARG ADMIN_EMAIL

ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN \
  DB_USER=$DB_USER \
  DB_USER_PASSWORD=$DB_USER_PASSWORD \
  DB_CLUSTER_PATH=$DB_CLUSTER_PATH \
  DB_NAME=$DB_NAME \
  GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  JWT_SECRET=$JWT_SECRET \
  ADMIN_EMAIL=$ADMIN_EMAIL

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile
COPY --from=builder /app/src ./src
RUN npm install -g tsx
EXPOSE 3000

CMD ["tsx", "src/index.ts"]