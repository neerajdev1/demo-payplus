export type Book = {
  id: string;
  title: string;
  author: string;
  price: number; // INR
  genre: string;
  color: string; // cover gradient
};

// Payplus payments are real money (minimum ₹10), so a few books are priced low for testing.
export const books: Book[] = [
  { id: "b1", title: "The Silent Orchard", author: "Meera Kapoor", price: 10, genre: "Fiction", color: "from-emerald-500 to-teal-700" },
  { id: "b2", title: "Code of the Monsoon", author: "Arjun Rao", price: 15, genre: "Tech", color: "from-sky-500 to-indigo-700" },
  { id: "b3", title: "Midnight at Marine Drive", author: "Sana Qureshi", price: 20, genre: "Mystery", color: "from-slate-600 to-slate-900" },
  { id: "b4", title: "Spice Route Chronicles", author: "Vikram Nair", price: 149, genre: "History", color: "from-amber-500 to-orange-700" },
  { id: "b5", title: "Learning to Fly Kites", author: "Ananya Iyer", price: 199, genre: "Children", color: "from-pink-500 to-rose-600" },
  { id: "b6", title: "The Chai Economist", author: "Rohan Mehta", price: 299, genre: "Business", color: "from-yellow-600 to-amber-800" },
  { id: "b7", title: "Stars Over Ladakh", author: "Tenzin Dorje", price: 349, genre: "Travel", color: "from-violet-500 to-purple-800" },
  { id: "b8", title: "Algorithms in Everyday Life", author: "Priya Sharma", price: 499, genre: "Tech", color: "from-cyan-500 to-blue-700" },
];

export const findBook = (id: string) => books.find((b) => b.id === id);
