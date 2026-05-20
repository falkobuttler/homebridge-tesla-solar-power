import type { PlatformAccessory, Service } from 'homebridge';
import type { TeslaSolarPlatform } from '../platform.js';
import type { GatewayReading } from '../teslaOwnerApi.js';
import { BasePowerAccessory } from './baseAccessory.js';

const LOW_BATTERY_THRESHOLD = 20;

// Tesla convention for the battery meter: instant_power > 0 means the Powerwall is
// discharging (sending energy to home/grid); < 0 means it is being charged.
export class PowerwallAccessory extends BasePowerAccessory {
  private readonly battery: Service;

  constructor(platform: TeslaSolarPlatform, accessory: PlatformAccessory, displayName: string) {
    super(platform, accessory, displayName);

    const { Service } = this.platform.api.hap;
    this.battery =
      accessory.getService(Service.Battery) ?? accessory.addService(Service.Battery, `${displayName} Battery`);
  }

  update(reading: GatewayReading): void {
    const { Characteristic } = this.platform.api.hap;
    const flowWatts = reading.meters.battery.instant_power;
    this.setWatts(flowWatts);

    const percent = Math.max(0, Math.min(100, Math.round(reading.batteryPercent)));
    this.battery.updateCharacteristic(Characteristic.BatteryLevel, percent);
    this.battery.updateCharacteristic(
      Characteristic.StatusLowBattery,
      percent <= LOW_BATTERY_THRESHOLD
        ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );
    this.battery.updateCharacteristic(
      Characteristic.ChargingState,
      flowWatts < -50
        ? Characteristic.ChargingState.CHARGING
        : Characteristic.ChargingState.NOT_CHARGING,
    );
  }
}
