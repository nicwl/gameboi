#pragma once

struct NamedRegisters {
  uint8_t b;
  uint8_t c;
  uint8_t d;
  uint8_t e;
  uint8_t h;
  uint8_t l;
  uint8_t pad;
  uint8_t a;
  uint8_t f;
  uint8_t pad2;
};

struct RegisterPairs {
  uint16_t bc;
  uint16_t de;
  uint16_t hl;
  // af can't be aligned well while allowing registers to be indexed
  // by their machine code representation, so is omitted here.
  // We do need to make sure these register structs are all the same size, though
  uint16_t pad;
  uint16_t pad2;
};

struct IndexedRegisters {
  uint8_t reg[10];
};

static_assert(sizeof(NamedRegisters) == sizeof(RegisterPairs) &&
                sizeof(RegisterPairs) == sizeof(NamedRegisters),
              "Register struct size mismatch");

union RegisterState {
  NamedRegisters name;
  RegisterPairs pair;
  IndexedRegisters index;
};

struct CPU {
  uint8_t* memory;
  uint16_t pc;
  uint32_t clock;
  RegisterState reg;
};

// Having actual globals is dangerous, because we're recklessly writing
// to arbitrary pointers. Emscripten will probably compile this expression
// to a constant every time.
#define cpu (*(CPU*)sizeof(CPU))

#define FLAG_Z 0b10000000
#define FLAG_N 0b01000000
#define FLAG_H 0b00100000
#define FLAG_C 0b00010000

#define SET_FLAG(flag) ( cpu.reg.name.f |= flag )
#define RESET_FLAG(flag) ( cpu.reg.name.f &= ~flag )
#define MOD_FLAG(flag, value) ( (value) ? SET_FLAG(flag) : RESET_FLAG(flag) )
#define GET_FLAG(flag) (!!(cpu.reg.name.f & flag))
