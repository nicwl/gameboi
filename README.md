# gameboi

In-browser gameboy emulator.

## How to play a game (to be improved later)

1. Legally acquire a gameboy ROM
2. Use `romgen.py` to translate it into a javascript file. (e.g. `python romgen.py PokemonRed.gb PokemonRed`)
3. Modify `test.html` to load the file and place an instance of the class into memory.
4. Play game.

## Roadmap

1. Successfully run the Nintendo boot ROM. ✅
2. Write a series of hacks, each more horrible than the last, until Blargg's cpu_instrs tests all pass. ✅
3. Pile more hacks on top of these until Pokémon Red basically works (basic lcd, basic sound, etc.). ✅
4. Rewrite CPU in C++ and compile to wasm. 🚧
5. Implement LCD to spec
6. Implement timers to spec (may need to become part of the CPU)
7. Implement audio to spec
8. See if compiling gameboy programs to wasm is
    1. possible (probably)
    2. beneficial (probably not)
9. Improve game loading flow
10. Implement battery-powered cartridge RAM (saved games)
