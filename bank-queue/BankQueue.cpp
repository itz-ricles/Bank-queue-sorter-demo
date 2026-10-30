// Bank Queue System - the queue logic, written in C++.
// Data Structures (INF 311): an application of queues (FIFO).
//
// Each lane is a CIRCULAR QUEUE stored in a fixed array. Compiled to
// WebAssembly (bank_queue.wasm) so it runs in the browser. The web page
// (index.html + app.js) only draws the interface; every queue operation
// below is C++.
//
// Build:  clang --target=wasm32 -O2 -nostdlib -ffreestanding -fno-builtin \
//               -Wl,--no-entry -o bank_queue.wasm BankQueue.cpp

#define EXPORT(name) __attribute__((export_name(name)))

constexpr int CAP      = 10;   // slots in each lane's array
constexpr int NAME_LEN = 24;
constexpr int NUM_SERVICES = 4;

// Minutes each service takes: Deposit, Withdrawal, Open account, Enquiry
static const int SERVICE_MINUTES[NUM_SERVICES] = {3, 3, 10, 2};

static void copyText(char* dest, const char* src) {
    int i = 0;
    while (src[i] != '\0' && i < NAME_LEN - 1) { dest[i] = src[i]; i++; }
    dest[i] = '\0';
}

// ---- A circular queue stored in arrays ---------------------------------------
// 'front' is the index of the oldest customer. New customers go at
// (front + size) % CAP, so the end of the line wraps around to slot 0
// when it reaches the end of the array.
struct Queue {
    int           ticket[CAP];
    unsigned char service[CAP];
    char          name[CAP][NAME_LEN];
    int           front;
    int           size;

    bool isEmpty() const { return size == 0; }
    bool isFull()  const { return size == CAP; }
    int  rear()    const { return (front + size) % CAP; }        // next free slot
    int  slotOf(int pos) const { return (front + pos) % CAP; }   // pos 0 = front of the line

    // ENQUEUE: add at the rear, O(1). Returns false if the array is full.
    bool enqueue(int t, int svc, const char* who) {
        if (isFull()) return false;
        int r = rear();
        ticket[r] = t;
        service[r] = (unsigned char)svc;
        copyText(name[r], who);
        size++;
        return true;
    }

    // DEQUEUE: remove from the front, O(1). Nobody is shifted: front just moves on.
    void dequeue() {
        front = (front + 1) % CAP;
        size--;
    }
};

static Queue lanes[2];            // lane 0 = regular, lane 1 = VIP
static int   nextTicket[2] = {1, 1};
static char  nameBuffer[NAME_LEN];   // the page hands a name to C++ here

// What was served most recently
static int  servedTicket = 0, servedLane = 0, servedService = 0, servedCount = 0;
static char servedName[NAME_LEN];

extern "C" {

// ---- Queue operations ----------------------------------------------------------

// Take a ticket. Returns 0 = ok, 1 = that lane is full, 2 = bad lane or service
EXPORT("add_customer") int add_customer(int lane, int svc) {
    if (lane < 0 || lane > 1 || svc < 0 || svc >= NUM_SERVICES) return 2;
    if (lanes[lane].isFull()) return 1;
    lanes[lane].enqueue(nextTicket[lane], svc, nameBuffer[0] ? nameBuffer : "Guest");
    nextTicket[lane]++;
    return 0;
}

// Call the next customer. VIP lane first, then the regular lane (both FIFO).
// Returns 0 = nobody waiting, 1 = served a regular customer, 2 = served a VIP
EXPORT("serve_next") int serve_next() {
    int lane = !lanes[1].isEmpty() ? 1 : (!lanes[0].isEmpty() ? 0 : -1);
    if (lane == -1) return 0;
    Queue& q = lanes[lane];
    int f = q.front;                              // PEEK at the front
    servedTicket  = q.ticket[f];
    servedLane    = lane;
    servedService = q.service[f];
    copyText(servedName, q.name[f]);
    servedCount++;
    q.dequeue();
    return lane == 1 ? 2 : 1;
}

// Empty both lanes and start the ticket numbers again
EXPORT("clear_all") void clear_all() {
    for (int l = 0; l < 2; l++) { lanes[l].front = 0; lanes[l].size = 0; nextTicket[l] = 1; }
    servedTicket = 0; servedCount = 0; servedName[0] = '\0';
}

// ---- Reading the queue (position 0 = front of the line) -----------------------
EXPORT("queue_size") int queue_size(int lane) { return lanes[lane].size; }
EXPORT("capacity")   int capacity()           { return CAP; }
EXPORT("ticket_at")  int ticket_at(int lane, int pos)  { return lanes[lane].ticket[lanes[lane].slotOf(pos)]; }
EXPORT("service_at") int service_at(int lane, int pos) { return lanes[lane].service[lanes[lane].slotOf(pos)]; }
EXPORT("name_at")    const char* name_at(int lane, int pos) { return lanes[lane].name[lanes[lane].slotOf(pos)]; }

// TRAVERSAL: minutes of work ahead of this customer, O(n).
// VIPs are always called first, so a regular customer also waits for the whole VIP lane.
EXPORT("wait_minutes") int wait_minutes(int lane, int pos) {
    int total = 0;
    if (lane == 0)
        for (int p = 0; p < lanes[1].size; p++) total += SERVICE_MINUTES[service_at(1, p)];
    for (int p = 0; p < pos; p++) total += SERVICE_MINUTES[service_at(lane, p)];
    return total;
}

// ---- The raw array (to show how the circular queue sits in memory) ------------
EXPORT("front_slot") int front_slot(int lane) { return lanes[lane].front; }
EXPORT("rear_slot")  int rear_slot(int lane)  { return lanes[lane].rear(); }
EXPORT("slot_ticket") int slot_ticket(int lane, int slot) {   // 0 if the slot is empty
    const Queue& q = lanes[lane];
    return ((slot - q.front + CAP) % CAP) < q.size ? q.ticket[slot] : 0;
}

// ---- Last served ----------------------------------------------------------------
EXPORT("served_ticket")  int served_ticket()  { return servedTicket; }
EXPORT("served_lane")    int served_lane()    { return servedLane; }
EXPORT("served_service") int served_service() { return servedService; }
EXPORT("served_count")   int served_count()   { return servedCount; }
EXPORT("served_name")    const char* served_name() { return servedName; }

EXPORT("name_len")    int name_len() { return NAME_LEN; }
EXPORT("name_buffer") char* name_buffer() { return nameBuffer; }

}  // extern "C"
