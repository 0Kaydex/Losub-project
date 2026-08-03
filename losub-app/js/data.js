const currentUser = {
  name: "Chidinma Adaeze",
  email: "chidinma@example.com",
};

const myGroups = [
  {
    id: "grp-1",
    planId: "spotify",
    planName: "Spotify Premium",
    seatsFilled: 4,
    seatsTotal: 6,
    myPaymentStatus: "paid", // paid | due | overdue
    nextDueDate: "Aug 5, 2026",
    manager: "Tunde K.",
  },
  {
    id: "grp-2",
    planId: "netflix",
    planName: "Netflix Standard",
    seatsFilled: 4,
    seatsTotal: 4,
    myPaymentStatus: "due",
    nextDueDate: "Jul 26, 2026",
    manager: "Amara N.",
  },
];

const notifications = [
  { id: 1, type: "payment_due", text: "Your Netflix Standard payment of ₦900 is due Jul 26.", time: "2h ago" },
  { id: 2, type: "manager_changed", text: "Spotify Premium group manager changed to Tunde K.", time: "1d ago" },
  { id: 3, type: "payment_overdue", text: "A payment on CapCut Pro group is overdue — you may lose your seat.", time: "3d ago" },
  { id: 4, type: "group_reassigned", text: "You were reassigned to a new Spotify Premium group after the previous one closed.", time: "5d ago" },
];

const availablePlans = [
  {
    id: "spotify",
    name: "Spotify Premium",
    category: "Music",
    pricePerSeat: 800,
    seatsFilled: 4,
    seatsTotal: 6,
    manager: { name: "Tunde K.", rating: 4.8 },
  },
  {
    id: "netflix",
    name: "Netflix Standard",
    category: "Streaming",
    pricePerSeat: 1200,
    seatsFilled: 4,
    seatsTotal: 4,
    manager: { name: "Amara N.", rating: 4.6 },
  },
  {
    id: "capcut",
    name: "CapCut Pro",
    category: "Productivity",
    pricePerSeat: 600,
    seatsFilled: 3,
    seatsTotal: 5,
    manager: { name: "Ifeoma B.", rating: 4.9 },
  },
  {
    id: "nintendo",
    name: "Nintendo Switch Online",
    category: "Gaming",
    pricePerSeat: 700,
    seatsFilled: 8,
    seatsTotal: 8,
    manager: { name: "Chuka O.", rating: 4.7 },
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    category: "Streaming",
    pricePerSeat: 900,
    seatsFilled: 2,
    seatsTotal: 5,
    manager: { name: "Zainab M.", rating: 4.5 },
  },
];