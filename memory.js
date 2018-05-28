class BadMemory {
  constructor(name) {
    this.name = name;
  }

  read(address) {
    console.error("Bad read from address 0x" + address.toString(16) + " of " + this.name);
    return 0xff;
  }

  write(address, value) {
    console.error("Bad write 0x" + value.toString(16) + " to address 0x" + address.toString(16) + " of " + this.name);
  }
}

class Memory {
  constructor(memories) {
    this.cartridge = memories.cartridge || new BadMemory('cartridge');
    this.videoRAM = memories.videoRAM || new BadMemory('videoRAM');
    this.switchableRAM = memories.switchableRAM || new BadMemory('switchableRAM');
    this.internalRAM = memories.internalRAM || new BadMemory('internalRAM');
    this.oam = memories.oam || new BadMemory('oam');
    this.io = memories.io || new BadMemory('io');
    this.stack = memories.stack || new BadMemory('stack');
    this.enableInterruptRegister = memories.enableInterruptRegister || new BadMemory('enableInterruptRegister');
    this.bootstrapROM = memories.bootstrapROM || new BadMemory('bootstrapROM');
  }

  mapAddress(address) {
    if (this.io.bootstrapROMEnabled && address <= 0xff) {
      return {'region': this.bootstrapROM, 'offset': address}
    }
    if (address < 0x8000) {
      return {'region': this.cartridge, 'offset': address};
    } else if (address < 0xa000) {
      return {'region': this.videoRAM, 'offset': address - 0x8000};
    } else if (address < 0xc000) {
      return {'region': this.cartridge, 'offset': address};
    } else if (address < 0xe000) {
      return {'region': this.internalRAM, 'offset': address - 0xc000};
    } else if (address < 0xfe00) {
      return {'region': this.internalRAM, 'offset': address - 0xe000};
    } else if (address < 0xff00) {
      return {'region': this.oam, 'offset': address - 0xfe00};
    } else if (address < 0xff80) {
      return {'region': this.io, 'offset': address - 0xff00};
    } else if (address < 0xffff) {
      return {'region': this.stack, 'offset': address - 0xff80};
    } else {
      return {'region': this.enableInterruptRegister, 'offset': 0};
    }
  }

  read(address) {
    let {region, offset} = this.mapAddress(address);
    return region.read(offset) & 0xff;
  }

  write(address, value) {
    let {region, offset} = this.mapAddress(address);
    region.write(offset, value & 0xff);
  }
}
