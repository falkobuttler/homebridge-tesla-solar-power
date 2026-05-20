import type { PlatformAccessory, Service } from 'homebridge';
import type { TeslaSolarPlatform } from '../platform.js';
import type { GatewayReading } from '../teslaOwnerApi.js';

// HomeKit's CurrentTemperature characteristic range is -270..100. Clamp to that.
const KW_MIN = -270;
const KW_MAX = 100;

export abstract class BasePowerAccessory {
  protected readonly powerSensor: Service;

  constructor(
    protected readonly platform: TeslaSolarPlatform,
    protected readonly accessory: PlatformAccessory,
    displayName: string,
  ) {
    const { Service, Characteristic } = this.platform.api.hap;

    accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Tesla')
      .setCharacteristic(Characteristic.Model, 'Energy Gateway')
      .setCharacteristic(Characteristic.SerialNumber, accessory.UUID);

    // Drop a stale LightSensor service left over from earlier plugin versions.
    const legacyLight = accessory.getService(Service.LightSensor);
    if (legacyLight) accessory.removeService(legacyLight);

    // TemperatureSensor renders as a tile in Apple Home (LightSensor doesn't), so kW
    // shows up directly on the Home view. The unit reads as °C — we treat it as kW.
    this.powerSensor =
      accessory.getService(Service.TemperatureSensor) ??
      accessory.addService(Service.TemperatureSensor, displayName);
    this.powerSensor.setCharacteristic(Characteristic.Name, displayName);
    this.powerSensor.getCharacteristic(this.platform.eve.CurrentConsumption);
  }

  abstract update(reading: GatewayReading): void;

  protected setWatts(watts: number): void {
    const { Characteristic } = this.platform.api.hap;
    const kW = Math.max(KW_MIN, Math.min(KW_MAX, watts / 1000));
    this.powerSensor.updateCharacteristic(Characteristic.CurrentTemperature, kW);
    this.powerSensor.updateCharacteristic(this.platform.eve.CurrentConsumption, watts);
  }
}
