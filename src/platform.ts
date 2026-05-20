import path from 'path';
import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TeslaOwnerApiClient, GatewayReading } from './teslaOwnerApi.js';
import { createEveCharacteristics, EveCharacteristics } from './eveCharacteristics.js';
import { BasePowerAccessory } from './accessories/baseAccessory.js';
import { SolarAccessory } from './accessories/solarAccessory.js';
import { GridAccessory } from './accessories/gridAccessory.js';
import { PowerwallAccessory } from './accessories/powerwallAccessory.js';

interface AccessorySpec {
  key: 'solar' | 'grid' | 'powerwall';
  displayName: string;
  factory: (accessory: PlatformAccessory) => BasePowerAccessory;
}

export interface TeslaSolarConfig extends PlatformConfig {
  refreshToken?: string;
  siteId?: string | number;
  pollIntervalSeconds?: number;
}

export class TeslaSolarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly eve: EveCharacteristics;

  private readonly cachedAccessories: PlatformAccessory[] = [];
  private readonly handlers = new Map<string, BasePowerAccessory>();
  private client?: TeslaOwnerApiClient;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    public readonly log: Logger,
    public readonly config: TeslaSolarConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.eve = createEveCharacteristics(api);

    this.api.on('didFinishLaunching', () => {
      this.start().catch((err) => this.log.error('Failed to start platform:', err));
    });
    this.api.on('shutdown', () => {
      if (this.pollTimer) clearInterval(this.pollTimer);
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.push(accessory);
  }

  private async start(): Promise<void> {
    if (!this.config.refreshToken) {
      this.log.error('Missing required config: "refreshToken" must be set.');
      return;
    }

    this.client = new TeslaOwnerApiClient(
      {
        refreshToken: this.config.refreshToken,
        siteId: this.config.siteId,
        tokenStorePath: path.join(this.api.user.storagePath(), 'tesla-solar-power-token.json'),
      },
      this.log,
    );

    const specs: AccessorySpec[] = [
      { key: 'solar', displayName: 'Solar', factory: (a) => new SolarAccessory(this, a, 'Solar') },
      { key: 'grid', displayName: 'Grid', factory: (a) => new GridAccessory(this, a, 'Grid') },
      {
        key: 'powerwall',
        displayName: 'Powerwall',
        factory: (a) => new PowerwallAccessory(this, a, 'Powerwall'),
      },
    ];

    for (const spec of specs) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${spec.key}`);
      let accessory = this.cachedAccessories.find((a) => a.UUID === uuid);
      if (accessory) {
        this.log.debug(`Restoring accessory from cache: ${accessory.displayName}`);
      } else {
        this.log.info(`Registering new accessory: ${spec.displayName}`);
        accessory = new this.api.platformAccessory(spec.displayName, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      this.handlers.set(spec.key, spec.factory(accessory));
    }

    const validUuids = new Set(
      specs.map((s) => this.api.hap.uuid.generate(`${PLUGIN_NAME}:${s.key}`)),
    );
    const stale = this.cachedAccessories.filter((a) => !validUuids.has(a.UUID));
    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    const intervalMs = Math.max(60, this.config.pollIntervalSeconds ?? 300) * 1000;
    await this.poll();
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => this.log.debug('Poll failed:', err.message ?? err));
    }, intervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.client) return;
    let reading: GatewayReading;
    try {
      reading = await this.client.fetch();
    } catch (err) {
      this.log.warn('Failed to read Tesla Owner API:', (err as Error).message);
      return;
    }
    for (const handler of this.handlers.values()) {
      handler.update(reading);
    }
  }
}
