// Aptitude Questions Pool
export const aptitudeQuestions = [
  {
    id: 1,
    question: "If A = 1, B = 2, C = 3... What is the value of CAT?",
    options: ["24", "27", "21", "26"],
    answer: "24"
  },
  {
    id: 2,
    question: "What is the next number in the series? 2, 6, 12, 20, 30, ?",
    options: ["36", "40", "42", "50"],
    answer: "42"
  },
  {
    id: 3,
    question: "A train travels 60 km in 45 minutes. What is its speed in km/hr?",
    options: ["80", "90", "75", "85"],
    answer: "80"
  },
  {
    id: 4,
    question: "If 5 workers can complete a task in 12 days, how many days will 8 workers take?",
    options: ["7.5", "8", "9", "10"],
    answer: "7.5"
  },
  {
    id: 5,
    question: "What is 15% of 200?",
    options: ["25", "30", "35", "40"],
    answer: "30"
  },
  {
    id: 6,
    question: "A shopkeeper sells an item at 20% profit. If the cost price is ₹500, what is the selling price?",
    options: ["₹550", "₹600", "₹650", "₹700"],
    answer: "₹600"
  },
  {
    id: 7,
    question: "Find the odd one out: 2, 5, 10, 17, 26, 37, 50",
    options: ["5", "10", "26", "50"],
    answer: "50"
  },
  {
    id: 8,
    question: "If EARTH is coded as 52987 and MOON is coded as 1334, what is the code for WATER?",
    options: ["92859", "85729", "95827", "82759"],
    answer: "92859"
  },
  {
    id: 9,
    question: "A clock shows 3:15. What is the angle between hour and minute hands?",
    options: ["0°", "7.5°", "15°", "30°"],
    answer: "7.5°"
  },
  {
    id: 10,
    question: "In a race of 100m, A beats B by 10m and B beats C by 10m. By how many meters does A beat C?",
    options: ["18m", "19m", "20m", "21m"],
    answer: "19m"
  }
];

export interface AptitudeQuestion {
  id: number;
  question: string;
  options: string[];
  answer: string;
}

export interface AptitudeTestResult {
  score: number;
  totalQuestions: number;
  selectedAnswers: { questionId: number; selectedOption: string; correctAnswer: string }[];
  startTime: Date;
  endTime: Date;
  timeTaken: string;
}
