import type { PlatformAccessory, Service } from 'homebridge';
import type { TeslaSolarPlatform } from '../platform.js';
import type { GatewayReading } from '../teslaOwnerApi.js';

const MIN_LUX = 0.0001;

export abstract class BasePowerAccessory {
  protected readonly lightSensor: Service;
  protected readonly currentConsumption: Service;

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

    this.lightSensor =
      accessory.getService(Service.LightSensor) ??
      accessory.addService(Service.LightSensor, displayName);
    this.lightSensor.setCharacteristic(Characteristic.Name, displayName);

    // A second service to host Eve characteristics. We reuse the LightSensor for now —
    // adding a custom Service is an option later, but Eve picks up these characteristics
    // wherever they appear on the accessory.
    this.currentConsumption = this.lightSensor;
    this.currentConsumption.getCharacteristic(this.platform.eve.CurrentConsumption);
  }

  abstract update(reading: GatewayReading): void;

  protected setWatts(watts: number): void {
    const { Characteristic } = this.platform.api.hap;
    const lux = Math.max(MIN_LUX, Math.abs(watts));
    this.lightSensor.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, lux);
    this.currentConsumption.updateCharacteristic(this.platform.eve.CurrentConsumption, watts);
  }
}
