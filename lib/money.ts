export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function formatUsd(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberWords(n % 100) : "");
  if (n < 1_000_000) return numberWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numberWords(n % 1000) : "");
  return String(n);
}

export function speakUsd(cents: Cents): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  const dollarWords = `${numberWords(dollars)} ${dollars === 1 ? "dollar" : "dollars"}`;
  if (rest === 0) return dollarWords;
  const centWords = `${numberWords(rest)} ${rest === 1 ? "cent" : "cents"}`;
  return dollars === 0 ? centWords : `${dollarWords} and ${centWords}`;
}
