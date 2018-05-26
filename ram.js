class RAM {
  constructor(size) {
    this.bytes = new Array(size);
    for (let i = 0; i < size; i++) this.bytes[i] = 0;
  }

  read(address) {
    return this.bytes[address];
  }

  write(address, value) {
    this.bytes[address] = value;
  }
}
