# Bank Queue System (C++ queues)

INF 311 Data Structures: an application of queues (FIFO).

- `BankQueue.cpp`: the main file. A circular queue stored in fixed arrays (one for the regular lane, one for the VIP lane) with enqueue, dequeue, peek and wait-time calculation, all in C++.
- `bank_queue.wasm`: BankQueue.cpp compiled to WebAssembly.
- `index.html`, `style.css`, `app.js`: the page that draws the interface and calls the C++ functions.

## Rebuild the .wasm

    clang --target=wasm32 -O2 -nostdlib -ffreestanding -fno-builtin -Wl,--no-entry -o bank_queue.wasm BankQueue.cpp

## Run locally

Browsers will not load a .wasm from a file:// address, so use a small local server:

    python3 -m http.server 8000

then open http://localhost:8000.

## Deploy

Upload this folder as a static site (Vercel, Render static site, GitHub Pages). No build step is needed.
