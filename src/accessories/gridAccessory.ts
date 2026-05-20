import type { GatewayReading } from '../teslaOwnerApi.js';
import { BasePowerAccessory } from './baseAccessory.js';

// Tesla convention: site.instant_power > 0 means import from grid, < 0 means export.
export class GridAccessory extends BasePowerAccessory {
  update(reading: GatewayReading): void {
    this.setWatts(reading.meters.site.instant_power);
  }
}
