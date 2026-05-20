import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { Logger } from 'homebridge';

const AUTH_HOST = 'https://auth.tesla.com';
const OWNER_API_HOST = 'https://owner-api.teslamotors.com';
const OWNER_API_CLIENT_ID = 'ownerapi';

// Mirrors the shape the local-gateway version produced, so the accessories don't have to change.
export interface MeterReading {
  instant_power: number;
}

export interface MeterAggregates {
  site: MeterReading;
  battery: MeterReading;
  load: MeterReading;
  solar: MeterReading;
}

export interface GatewayReading {
  meters: MeterAggregates;
  batteryPercent: number;
}

export interface OwnerApiOptions {
  refreshToken: string;
  siteId?: string | number;
  tokenStorePath: string;
}

interface SiteLiveStatus {
  response: {
    solar_power?: number;
    battery_power?: number;
    grid_power?: number;
    load_power?: number;
    percentage_charged?: number;
  };
}

interface ProductsResponse {
  response: Array<{
    energy_site_id?: number;
    resource_type?: string;
  }>;
}

interface TokenStore {
  refresh_token: string;
  access_token?: string;
  access_token_expires_at?: number;
}

export class TeslaOwnerApiClient {
  private readonly api: AxiosInstance;
  private readonly auth: AxiosInstance;
  private accessToken?: string;
  private accessTokenExpiresAt = 0;
  private currentRefreshToken: string;
  private resolvedSiteId?: string;

  constructor(private readonly options: OwnerApiOptions, private readonly log: Logger) {
    this.api = axios.create({ baseURL: OWNER_API_HOST, timeout: 15_000 });
    this.auth = axios.create({ baseURL: AUTH_HOST, timeout: 15_000 });
    this.currentRefreshToken = options.refreshToken;
    if (options.siteId) this.resolvedSiteId = String(options.siteId);
    this.loadStoredToken();
  }

  private loadStoredToken(): void {
    try {
      if (!fs.existsSync(this.options.tokenStorePath)) return;
      const raw = fs.readFileSync(this.options.tokenStorePath, 'utf8');
      const stored = JSON.parse(raw) as TokenStore;
      if (stored.refresh_token) this.currentRefreshToken = stored.refresh_token;
      if (stored.access_token && stored.access_token_expires_at) {
        this.accessToken = stored.access_token;
        this.accessTokenExpiresAt = stored.access_token_expires_at;
      }
    } catch (err) {
      this.log.debug('Could not load stored token, starting fresh:', (err as Error).message);
    }
  }

  private saveStoredToken(): void {
    const store: TokenStore = {
      refresh_token: this.currentRefreshToken,
      access_token: this.accessToken,
      access_token_expires_at: this.accessTokenExpiresAt,
    };
    try {
      fs.mkdirSync(path.dirname(this.options.tokenStorePath), { recursive: true });
      fs.writeFileSync(this.options.tokenStorePath, JSON.stringify(store, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (err) {
      this.log.warn('Failed to persist refreshed token:', (err as Error).message);
    }
  }

  private async refreshAccessToken(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OWNER_API_CLIENT_ID,
      refresh_token: this.currentRefreshToken,
      scope: 'openid email offline_access',
    });
    const res = await this.auth.post('/oauth2/v3/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = res.data as { access_token: string; expires_in: number; refresh_token?: string };
    this.accessToken = data.access_token;
    // 60s safety margin so we don't race expiry.
    this.accessTokenExpiresAt = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
    if (data.refresh_token && data.refresh_token !== this.currentRefreshToken) {
      this.log.debug('Refresh token rotated, persisting new value');
      this.currentRefreshToken = data.refresh_token;
    }
    this.saveStoredToken();
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;
    await this.refreshAccessToken();
    if (!this.accessToken) throw new Error('Failed to obtain access token');
    return this.accessToken;
  }

  private async authedGet<T>(url: string): Promise<T> {
    let token = await this.ensureAccessToken();
    try {
      return (await this.api.get<T>(url, { headers: { Authorization: `Bearer ${token}` } })).data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.log.debug('Access token rejected, refreshing');
        this.accessToken = undefined;
        token = await this.ensureAccessToken();
        return (await this.api.get<T>(url, { headers: { Authorization: `Bearer ${token}` } })).data;
      }
      throw err;
    }
  }

  private async resolveSiteId(): Promise<string> {
    if (this.resolvedSiteId) return this.resolvedSiteId;
    const products = await this.authedGet<ProductsResponse>('/api/1/products');
    const site = products.response.find(
      (p) => typeof p.energy_site_id === 'number' && p.resource_type !== 'vehicle',
    );
    if (!site?.energy_site_id) {
      throw new Error('No energy site found on this Tesla account');
    }
    this.resolvedSiteId = String(site.energy_site_id);
    this.log.info(`Resolved Tesla energy site ID: ${this.resolvedSiteId}`);
    return this.resolvedSiteId;
  }

  async fetch(): Promise<GatewayReading> {
    const siteId = await this.resolveSiteId();
    const data = await this.authedGet<SiteLiveStatus>(
      `/api/1/energy_sites/${encodeURIComponent(siteId)}/live_status`,
    );
    const r = data.response;
    // Sign convention assumed (matching the local gateway): battery_power > 0 = discharging,
    // grid_power > 0 = importing. If readings look inverted, flip them here.
    return {
      meters: {
        solar: { instant_power: r.solar_power ?? 0 },
        battery: { instant_power: r.battery_power ?? 0 },
        site: { instant_power: r.grid_power ?? 0 },
        load: { instant_power: r.load_power ?? 0 },
      },
      batteryPercent: r.percentage_charged ?? 0,
    };
  }
}
