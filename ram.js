class RAM {
  constructor(size) {
    this.bytes = new Array(size).fill(1);
  }

  read(address) {
    return this.bytes[address];
  }

  write(address, value) {
    this.bytes[address] = value;
  }
}
