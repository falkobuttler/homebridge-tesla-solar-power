import type { GatewayReading } from '../teslaOwnerApi.js';
import { BasePowerAccessory } from './baseAccessory.js';

export class SolarAccessory extends BasePowerAccessory {
  update(reading: GatewayReading): void {
    const watts = Math.max(0, reading.meters.solar.instant_power);
    this.setWatts(watts);
  }
}
