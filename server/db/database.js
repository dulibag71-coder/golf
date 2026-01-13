import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel ? ':memory:' : './airswing.db';

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('데이터베이스 연결 실패:', err.message);
    } else {
        console.log(`SQLite 데이터베이스 연결 성공 (${isVercel ? 'Memory' : 'File'})`);
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        // 1. 사용자 테이블 확장
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user', -- user | admin
            skill_level TEXT DEFAULT 'beginner',
            subscription TEXT DEFAULT 'free', -- free | pro
            equipped_ball TEXT DEFAULT 'standard', -- 서버 연동용 장착 아이템
            subscription_start DATETIME,
            subscription_end DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 5. 원격 커맨드 큐 (모바일 -> PC 브릿지)
        db.run(`CREATE TABLE IF NOT EXISTS remote_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            command TEXT,
            payload TEXT,
            is_processed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. 결제 내역 테이블
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            payment_id TEXT UNIQUE,
            amount REAL,
            currency TEXT DEFAULT 'KRW',
            status TEXT, -- pending | success | failed | refunded
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 3. 시스템 로그 테이블
        db.run(`CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            ip_address TEXT,
            level TEXT DEFAULT 'info', -- info | warn | error
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 4. 샷 기록 테이블 (기존 유지)

        // 2. 샷 기록 테이블
        db.run(`CREATE TABLE IF NOT EXISTS shots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            club_id TEXT,
            ball_speed REAL,
            launch_angle REAL,
            spin_rate REAL,
            carry_dist REAL,
            total_dist REAL,
            env_settings TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 3. 라운드 기록 테이블
        db.run(`CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            score_card TEXT,
            total_score INTEGER,
            is_completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        console.log('모든 테이블 초기화 완료');
    });
}

export default db;
