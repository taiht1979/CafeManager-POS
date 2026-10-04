/**
 * Module kết nối CSDL Neon Serverless PostgreSQL
 * 
 * Hỗ trợ tự động:
 * 1. Chuỗi kết nối DATABASE_URL từ Neon Console (postgresql://user:pass@ep-xyz.aws.neon.tech/neondb?sslmode=require)
 * 2. Cấu hình SSL tương thích Serverless
 * 3. Tự động kiểm tra trạng thái kết nối
 */

const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 
                         process.env.POSTGRES_URL || 
                         process.env.POSTGRES_PRISMA_URL || 
                         process.env.POSTGRES_URL_NON_POOLING || '';

let pool = null;

if (connectionString) {
    pool = new Pool({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        },
        max: 10, // Giới hạn pool kết nối cho serverless
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
        console.error('⚠️ [Neon PostgreSQL] Lỗi ngoài ý muốn trong Pool:', err.message);
    });
}

/**
 * Thực thi câu truy vấn SQL an toàn tới Neon DB
 */
async function query(text, params) {
    if (!pool) {
        throw new Error('DATABASE_URL chưa được cấu hình. Vui lòng thêm biến môi trường trên Vercel hoặc file .env!');
    }
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        return res;
    } catch (err) {
        console.error('❌ [Neon Query Error]:', err.message, '| SQL:', text);
        throw err;
    }
}

/**
 * Kiểm tra kết nối tới Neon DB
 */
async function testConnection() {
    if (!connectionString) {
        return {
            connected: false,
            message: 'Chưa cấu hình DATABASE_URL (Đang chạy ở chế độ Demo/Mock Data)'
        };
    }

    try {
        const res = await query('SELECT NOW() as current_time, current_database() as db_name, version() as pg_version');
        return {
            connected: true,
            database: res.rows[0].db_name,
            serverTime: res.rows[0].current_time,
            version: res.rows[0].pg_version
        };
    } catch (err) {
        return {
            connected: false,
            error: err.message
        };
    }
}

module.exports = {
    query,
    testConnection,
    isConfigured: () => !!connectionString,
    getPool: () => pool
};
