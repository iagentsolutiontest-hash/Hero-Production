import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'crypto';
import { getPool, withRlsBypass } from '../../db/pool';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private accessSecret = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';
  private refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
  private accessTtl = process.env.JWT_ACCESS_TTL || '15m';
  private refreshTtlDays = 7;

  async register(email: string, password: string, fullName: string) {
    return withRlsBypass(async () => {
    const pool = getPool();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new ConflictException('An account with this email already exists');
    }

    this.assertPasswordStrength(password);

    // Argon2id — the brief specifically calls this out over bcrypt/plain hashing.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3)
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName],
    );
    return result.rows[0];
    });
  }

  async login(email: string, password: string): Promise<AuthTokens & { userId: string }> {
    return withRlsBypass(async () => {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, password_hash, is_active FROM users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      // Same error for "no such user" and "wrong password" — don't leak
      // which one it was (user enumeration).
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = result.rows[0];
    if (!user.is_active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user.id);
    return { ...tokens, userId: user.id };
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return withRlsBypass(async () => {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(refreshToken, this.refreshSecret) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const pool = getPool();
    const stored = await pool.query(
      `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );

    if (stored.rows.length === 0 || stored.rows[0].revoked_at) {
      // Reuse of a rotated-out (or unknown) token — treat as compromised
      // and revoke all sessions for the user if we can identify them.
      if (stored.rows[0]?.user_id) {
        await pool.query(
          `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [stored.rows[0].user_id],
        );
      }
      throw new UnauthorizedException('Refresh token has been revoked or reused');
    }

    if (new Date(stored.rows[0].expires_at) < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: revoke the used token, issue a new pair.
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [
      stored.rows[0].id,
    ]);

    return this.issueTokens(stored.rows[0].user_id);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    return withRlsBypass(async () => {
    const tokenHash = this.hashToken(refreshToken);
    const pool = getPool();
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    });
  }

  verifyAccessToken(token: string): { sub: string } {
    try {
      return jwt.verify(token, this.accessSecret) as { sub: string };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    // Nested bypass-safe: parent login/refresh already bypasses; still set GUCs for pool
    const accessToken = jwt.sign({ sub: userId }, this.accessSecret, {
      expiresIn: this.accessTtl,
    } as jwt.SignOptions);

    const jti = randomUUID();
    const refreshToken = jwt.sign({ sub: userId, jti }, this.refreshSecret, {
      expiresIn: `${this.refreshTtlDays}d`,
    });

    const pool = getPool();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, this.hashToken(refreshToken), expiresAt],
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    // We never store raw refresh tokens, only a hash — so a DB leak alone
    // doesn't hand out usable sessions.
    return createHash('sha256').update(token).digest('hex');
  }

  private assertPasswordStrength(password: string): void {
    if (password.length < 10) {
      throw new BadRequestException(
        'Password must be at least 10 characters long',
      );
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one uppercase letter and one number',
      );
    }
  }
}
