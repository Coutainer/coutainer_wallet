#!/bin/bash

# Docker 환경에서 마이그레이션 실행 스크립트
echo "🐳 Running database migrations in Docker environment..."

# 환경변수 확인
if [ -z "$DB_HOST" ]; then
    echo "❌ DB_HOST environment variable is not set"
    exit 1
fi

if [ -z "$DB_USER" ]; then
    echo "❌ DB_USER environment variable is not set"
    exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ DB_PASSWORD environment variable is not set"
    exit 1
fi

if [ -z "$DB_NAME" ]; then
    echo "❌ DB_NAME environment variable is not set"
    exit 1
fi

echo "📊 Database connection info:"
echo "  Host: $DB_HOST"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"

# 빌드 및 마이그레이션 실행
echo "🔨 Building application..."
npm run build

echo "🔄 Running migrations..."
npm run migrate

echo "✅ Migration completed successfully!"
