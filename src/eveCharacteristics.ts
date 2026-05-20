import type { API, Characteristic, WithUUID } from 'homebridge';

export interface EveCharacteristics {
  CurrentConsumption: WithUUID<new () => Characteristic>;
  TotalConsumption: WithUUID<new () => Characteristic>;
  Voltage: WithUUID<new () => Characteristic>;
  ElectricCurrent: WithUUID<new () => Characteristic>;
}

export function createEveCharacteristics(api: API): EveCharacteristics {
  const { Characteristic, Formats, Perms } = api.hap;

  class CurrentConsumption extends Characteristic {
    static readonly UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
    constructor() {
      super('Current Consumption', CurrentConsumption.UUID, {
        format: Formats.FLOAT,
        unit: 'W',
        minValue: -100_000,
        maxValue: 100_000,
        minStep: 0.1,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  class TotalConsumption extends Characteristic {
    static readonly UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
    constructor() {
      super('Total Consumption', TotalConsumption.UUID, {
        format: Formats.FLOAT,
        unit: 'kWh',
        minValue: 0,
        maxValue: 1_000_000,
        minStep: 0.01,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  class Voltage extends Characteristic {
    static readonly UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
    constructor() {
      super('Voltage', Voltage.UUID, {
        format: Formats.FLOAT,
        unit: 'V',
        minValue: 0,
        maxValue: 1000,
        minStep: 0.1,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  class ElectricCurrent extends Characteristic {
    static readonly UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';
    constructor() {
      super('Electric Current', ElectricCurrent.UUID, {
        format: Formats.FLOAT,
        unit: 'A',
        minValue: -1000,
        maxValue: 1000,
        minStep: 0.01,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
      this.value = 0;
    }
  }

  return {
    CurrentConsumption: CurrentConsumption as unknown as WithUUID<new () => Characteristic>,
    TotalConsumption: TotalConsumption as unknown as WithUUID<new () => Characteristic>,
    Voltage: Voltage as unknown as WithUUID<new () => Characteristic>,
    ElectricCurrent: ElectricCurrent as unknown as WithUUID<new () => Characteristic>,
  };
}
