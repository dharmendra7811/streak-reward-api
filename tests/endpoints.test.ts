import 'dotenv/config';
import http from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { initSocketIO, getIOOrNull } from '../src/lib/socket';
import { registerLeaderboardHandlers } from '../src/sockets/leaderboard.socket';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { yesterdayDate, todayDate, toDateKey } from '../src/lib/dates';

const TZ = process.env.SCHEDULER_TIMEZONE ?? 'Asia/Kolkata';

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "rewards", "activity_logs", "scheduler_logs", "users" CASCADE');
  await redis.flushall();
}

describe('E2E Endpoints and WebSockets Test', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  // Store tokens for headers
  let userToken: string;
  let user2Token: string;
  let adminToken: string;
  let userId: string;
  let user2Id: string;

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    const io = initSocketIO(server);
    registerLeaderboardHandlers(io);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          port = addr.port;
          baseUrl = `http://localhost:${port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    const io = getIOOrNull();
    if (io) {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await redis.disconnect();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  describe('GET /health', () => {
    it('returns status ok', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe('ok');
    });
  });

  describe('Authentication Module', () => {
    it('rejects registration with invalid fields', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'J',
          email: 'invalid-email',
          password: '123',
          role: 'invalid-role',
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error: { message: string } };
      expect(data.error.message).toBe('Validation failed');
    });

    it('registers user and admin successfully and rejects duplicates', async () => {
      // 1. Register user
      const registerRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      expect(registerRes.status).toBe(201);
      const registerData = await registerRes.json() as { token: string; user: { id: string; role: string } };
      expect(registerData.token).toBeDefined();
      expect(registerData.user.role).toBe('user');
      userToken = registerData.token;
      userId = registerData.user.id;

      // 2. Reject duplicate email registration
      const duplicateRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Clone',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      expect(duplicateRes.status).toBe(409);

      // 3. Register admin
      const adminRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin',
        }),
      });
      expect(adminRes.status).toBe(201);
      const adminData = await adminRes.json() as { token: string };
      adminToken = adminData.token;
    });

    it('authenticates login attempts', async () => {
      // Register user first
      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
          role: 'user',
        }),
      });

      // Successful login
      const successRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'john@example.com',
          password: 'password123',
        }),
      });
      expect(successRes.status).toBe(200);
      const successData = await successRes.json() as { token: string };
      expect(successData.token).toBeDefined();

      // Failed login (wrong password)
      const failRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'john@example.com',
          password: 'wrongpassword',
        }),
      });
      expect(failRes.status).toBe(401);
    });
  });

  describe('Activity Logging Module', () => {
    beforeEach(async () => {
      // Register users and admin for testing logging
      const userRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const userData = await userRes.json() as { token: string; user: { id: string } };
      userToken = userData.token;
      userId = userData.user.id;

      const user2Res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Smith',
          email: 'bob@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const user2Data = await user2Res.json() as { token: string; user: { id: string } };
      user2Token = user2Data.token;
      user2Id = user2Data.user.id;

      const adminRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin',
        }),
      });
      const adminData = await adminRes.json() as { token: string };
      adminToken = adminData.token;
    });

    it('rejects activity logging for unauthorized/admin users', async () => {
      // Missing token
      const noTokenRes = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: 'exercise' }),
      });
      expect(noTokenRes.status).toBe(401);

      // Admin role logged-in
      const adminLogRes = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ activity_type: 'exercise' }),
      });
      expect(adminLogRes.status).toBe(403);
    });

    it('logs activity for today, prevents duplicates of same type, and supports multiple types', async () => {
      // 1. Log exercise
      const log1Res = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ activity_type: 'exercise' }),
      });
      expect(log1Res.status).toBe(201);
      const log1Data = await log1Res.json() as { activityType: string; loggedDate: string };
      expect(log1Data.activityType).toBe('exercise');

      // 2. Log exercise again (same day duplicate log check) -> 409 conflict
      const log2Res = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ activity_type: 'exercise' }),
      });
      expect(log2Res.status).toBe(409);

      // 3. Log hydration (different type, same day) -> should succeed
      const log3Res = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ activity_type: 'hydration' }),
      });
      expect(log3Res.status).toBe(201);
    });

    it('returns user activities list and daily summary', async () => {
      // Log some activities
      await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ activity_type: 'reading' }),
      });

      // Get activities list
      const listRes = await fetch(`${baseUrl}/activities/my`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(listRes.status).toBe(200);
      const listData = await listRes.json() as Array<{ type: string; date: string; contributed: boolean }>;
      expect(listData.length).toBe(1);
      expect(listData[0].type).toBe('reading');
      expect(listData[0].contributed).toBe(true);

      // Get summary
      const summaryRes = await fetch(`${baseUrl}/activities/summary`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(summaryRes.status).toBe(200);
      const summaryData = await summaryRes.json() as { todayActivities: string[]; currentStreak: number; totalPoints: number };
      expect(summaryData.todayActivities).toContain('reading');
      expect(summaryData.currentStreak).toBe(0);
      expect(summaryData.totalPoints).toBe(0);
    });
  });

  describe('Streak Processing Scheduler Module', () => {
    beforeEach(async () => {
      // Register users and admin
      const userRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const userData = await userRes.json() as { token: string; user: { id: string } };
      userToken = userData.token;
      userId = userData.user.id;

      const user2Res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Smith',
          email: 'bob@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const user2Data = await user2Res.json() as { token: string; user: { id: string } };
      user2Token = user2Data.token;
      user2Id = user2Data.user.id;

      const adminRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin',
        }),
      });
      const adminData = await adminRes.json() as { token: string };
      adminToken = adminData.token;
    });

    it('rejects scheduler trigger for normal users', async () => {
      const res = await fetch(`${baseUrl}/scheduler/run`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('processes streaks: increments for yesterday activity, resets otherwise, handles milestones and idempotency', async () => {
      // 1. Setup yesterday activity for User 1
      const yesterdayStr = toDateKey(yesterdayDate(TZ));
      const logRes = await fetch(`${baseUrl}/activities/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          activity_type: 'exercise',
          date: yesterdayStr,
        }),
      });
      expect(logRes.status).toBe(201);

      // User 2 logs nothing for yesterday

      // 2. Pre-set User 1 to streak count 2 so the increment reaches milestone 3 (50 pts)
      await prisma.user.update({
        where: { id: userId },
        data: { currentStreak: 2 },
      });

      // 3. Trigger scheduler as Admin
      const runRes = await fetch(`${baseUrl}/scheduler/run`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      expect(runRes.status).toBe(200);
      const runData = await runRes.json() as {
        alreadyProcessed: boolean;
        streaksIncremented: number;
        streaksReset: number;
        milestonesAwarded: number;
      };
      expect(runData.alreadyProcessed).toBe(false);
      expect(runData.streaksIncremented).toBe(1); // User 1
      // User 2 and Admin User did not log yesterday, so they both get reset. Total resets = 2.
      expect(runData.streaksReset).toBe(2);
      expect(runData.milestonesAwarded).toBe(1);  // User 1 reached 3

      // 4. Verify DB updates
      const user1Db = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user1Db.currentStreak).toBe(3);
      expect(user1Db.totalPoints).toBe(50);

      const user2Db = await prisma.user.findUniqueOrThrow({ where: { id: user2Id } });
      expect(user2Db.currentStreak).toBe(0);
      expect(user2Db.totalPoints).toBe(0);

      // 5. Test scheduler idempotency — run it again for the same day
      const run2Res = await fetch(`${baseUrl}/scheduler/run`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      expect(run2Res.status).toBe(200);
      const run2Data = await run2Res.json() as { alreadyProcessed: boolean };
      expect(run2Data.alreadyProcessed).toBe(true);

      // Total points and streaks must not have changed
      const user1Db2 = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user1Db2.currentStreak).toBe(3);
      expect(user1Db2.totalPoints).toBe(50);

      // 6. Check scheduler history
      const historyRes = await fetch(`${baseUrl}/scheduler/history`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      expect(historyRes.status).toBe(200);
      const historyData = await historyRes.json() as Array<{ date: string; usersProcessed: number }>;
      expect(historyData.length).toBe(1);
      expect(historyData[0].date).toBe(toDateKey(todayDate(TZ)));
    });
  });

  describe('Real-Time Leaderboard Module', () => {
    beforeEach(async () => {
      // Register users and admin
      const userRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const userData = await userRes.json() as { token: string; user: { id: string } };
      userToken = userData.token;
      userId = userData.user.id;

      const user2Res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bob Smith',
          email: 'bob@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const user2Data = await user2Res.json() as { token: string; user: { id: string } };
      user2Token = user2Data.token;
      user2Id = user2Data.user.id;

      const adminRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin',
        }),
      });
      const adminData = await adminRes.json() as { token: string };
      adminToken = adminData.token;
    });

    it('returns ranked leaderboard entries and caller rank', async () => {
      // Manually add some points to User 1
      await prisma.user.update({
        where: { id: userId },
        data: { totalPoints: 100, currentStreak: 5 },
      });
      // Refresh Redis Cache manually via streak.service style rebuild
      const leaderboardService = await import('../src/services/leaderboard.service');
      await leaderboardService.rebuild();

      // Retrieve leaderboard
      const lbRes = await fetch(`${baseUrl}/leaderboard`, {
        headers: { 'Authorization': `Bearer ${user2Token}` },
      });
      expect(lbRes.status).toBe(200);
      const lbData = await lbRes.json() as Array<{ rank: number; userId: string; points: number }>;
      expect(lbData.length).toBeGreaterThan(0);
      expect(lbData[0].userId).toBe(userId);
      expect(lbData[0].points).toBe(100);

      // Retrieve my rank for User 1
      const myRank1Res = await fetch(`${baseUrl}/leaderboard/my-rank`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(myRank1Res.status).toBe(200);
      const myRank1Data = await myRank1Res.json() as { rank: number; points: number };
      expect(myRank1Data.rank).toBe(1);
      expect(myRank1Data.points).toBe(100);

      // Retrieve my rank for User 2 (points = 0)
      const myRank2Res = await fetch(`${baseUrl}/leaderboard/my-rank`, {
        headers: { 'Authorization': `Bearer ${user2Token}` },
      });
      expect(myRank2Res.status).toBe(200);
      const myRank2Data = await myRank2Res.json() as { rank: number; points: number };
      // User 2 and Admin User both have 0 points, so user 2's rank is either 2 or 3
      expect(myRank2Data.rank).toBeGreaterThanOrEqual(2);
      expect(myRank2Data.points).toBe(0);
    });

    it('sends WebSocket updates when leaderboard shifts', async () => {
      // Set User 1 to have some points
      await prisma.user.update({
        where: { id: userId },
        data: { totalPoints: 50, currentStreak: 3 },
      });
      const leaderboardService = await import('../src/services/leaderboard.service');
      await leaderboardService.rebuild();

      const socket: ClientSocket = ioClient(`http://localhost:${port}`, {
        auth: { token: userToken },
        transports: ['websocket'],
        forceNew: true,
      });

      const events: Array<{ event: string; data: unknown }> = [];

      let timer: NodeJS.Timeout;
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => {
          resolve();
        }, 1500);

        socket.on('connect', () => {
          socket.emit('leaderboard:connect');
        });

        socket.on('leaderboard:update', (data) => {
          events.push({ event: 'leaderboard:update', data });
          if (events.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });

        socket.on('leaderboard:my-rank', (data) => {
          events.push({ event: 'leaderboard:my-rank', data });
          if (events.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });

        socket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      // Verify that initial state connection events were fired
      expect(events.some(e => e.event === 'leaderboard:update')).toBe(true);
      expect(events.some(e => e.event === 'leaderboard:my-rank')).toBe(true);

      socket.disconnect();
    });
  });

  describe('Rewards Module', () => {
    beforeEach(async () => {
      // Register user and admin
      const userRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securepassword123',
          role: 'user',
        }),
      });
      const userData = await userRes.json() as { token: string; user: { id: string } };
      userToken = userData.token;
      userId = userData.user.id;

      const adminRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'adminpassword123',
          role: 'admin',
        }),
      });
      const adminData = await adminRes.json() as { token: string };
      adminToken = adminData.token;
    });

    it('returns rewards summary and history for user and admin checks', async () => {
      // Create a mock reward for user
      await prisma.reward.create({
        data: {
          userId,
          milestone: '3',
          pointsAwarded: 50,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { totalPoints: 50, currentStreak: 3, longestStreak: 3 },
      });

      // 1. Get my rewards history
      const myRewardsRes = await fetch(`${baseUrl}/rewards/my`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(myRewardsRes.status).toBe(200);
      const myRewardsData = await myRewardsRes.json() as Array<{ milestone: string; pointsAwarded: number }>;
      expect(myRewardsData.length).toBe(1);
      expect(myRewardsData[0].milestone).toBe('3');
      expect(myRewardsData[0].pointsAwarded).toBe(50);

      // 2. Get my rewards summary
      const summaryRes = await fetch(`${baseUrl}/rewards/summary`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(summaryRes.status).toBe(200);
      const summaryData = await summaryRes.json() as {
        totalPoints: number;
        currentStreak: number;
        longestStreak: number;
        nextMilestone: { threshold: number; points: number };
      };
      expect(summaryData.totalPoints).toBe(50);
      expect(summaryData.currentStreak).toBe(3);
      expect(summaryData.longestStreak).toBe(3);
      expect(summaryData.nextMilestone.threshold).toBe(7); // Next is 7 days milestone

      // 3. Admin views user rewards history
      const adminUserRes = await fetch(`${baseUrl}/rewards/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      expect(adminUserRes.status).toBe(200);
      const adminUserData = await adminUserRes.json() as Array<{ milestone: string }>;
      expect(adminUserData.length).toBe(1);
      expect(adminUserData[0].milestone).toBe('3');

      // 4. User views user rewards history of others (Forbidden)
      const forbiddenRes = await fetch(`${baseUrl}/rewards/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      expect(forbiddenRes.status).toBe(403);
    });
  });
});
