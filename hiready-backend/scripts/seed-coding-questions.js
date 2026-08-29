/**
 * Seeds coding questions (LC easy/medium/hard) with per-language starter
 * code, visible + hidden test cases, company tags and explanations.
 *
 * I/O contract for candidates: the program receives ALL whitespace-separated
 * input tokens as `args` and prints its answer to stdout. Starter code for
 * every language contains the stdin-reading boilerplate already.
 *
 * Usage: node scripts/seed-coding-questions.js [--upgrade]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const CodingQuestion = require('../models/CodingQuestion');

// ── Per-language starter code (generic token-based I/O) ────────────────────
function starterFor(lang, title) {
  const hint = `Solve: ${title}. args = the whitespace-separated input tokens (strings) — parse as needed. Print the answer to stdout.`;
  const map = {
    python: `import sys\n\ndef solve(args):\n    """${hint}"""\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    print(solve(sys.stdin.read().split()))`,
    javascript: `/**\n * ${hint}\n */\nfunction solve(args) {\n  // Write your solution here\n}\n\nconst fs = require("fs");\nconst tokens = fs.readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);\nconsole.log(solve(tokens));`,
    typescript: `/**\n * ${hint}\n */\nfunction solve(args: string[]): string | number {\n  // Write your solution here\n  return "";\n}\n\nconst fs = require("fs");\nconst tokens: string[] = fs.readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);\nconsole.log(solve(tokens));`,
    java: `import java.util.*;\nimport java.io.*;\n\n/**\n * ${hint}\n */\npublic class Main {\n    static String solve(String[] args) {\n        // Write your solution here\n        return "";\n    }\n\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        StringBuilder sb = new StringBuilder();\n        String line;\n        while ((line = br.readLine()) != null) { sb.append(line).append(' '); }\n        String[] tokens = sb.toString().trim().isEmpty() ? new String[0] : sb.toString().trim().split("\\\\s+");\n        System.out.println(solve(tokens));\n    }\n}`,
    go: `package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n/**\n * ${hint}\n */\nfunc solve(args []string) string {\n\t// Write your solution here\n\treturn ""\n}\n\nfunc main() {\n\tscanner := bufio.NewScanner(os.Stdin)\n\tscanner.Buffer(make([]byte, 1024*1024), 1024*1024)\n\tvar tokens []string\n\tfor scanner.Scan() {\n\t\ttokens = append(tokens, strings.Fields(scanner.Text())...)\n\t}\n\tfmt.Println(solve(tokens))\n}`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\n/**\n * ${hint}\n */\nstring solve(vector<string> args) {\n    // Write your solution here\n    return "";\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    vector<string> args;\n    string tok;\n    while (cin >> tok) args.push_back(tok);\n    cout << solve(args) << endl;\n    return 0;\n}`,
    rust: `/**\n * ${hint}\n */\nfn solve(args: Vec<String>) -> String {\n    // Write your solution here\n    String::new()\n}\n\nfn main() {\n    use std::io::Read;\n    let mut input = String::new();\n    std::io::stdin().read_to_string(&mut input).unwrap();\n    let args: Vec<String> = input.split_whitespace().map(String::from).collect();\n    println!("{}", solve(args));\n}`,
  };
  return map[lang] || '';
}

/** Appends the constraints section to the question description. */
function constraintsLine(con) {
  return con ? `**Constraints:** ${con}\n\n` : '';
}

function q(t, d, c, tags, co, desc, con, tests, ex) {
  return {
    title: t,
    slug: t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    difficulty: d,
    category: c,
    tags,
    companies: co,
    description: constraintsLine(con) + desc,
    constraints: con || '',
    testCases: tests.map(([input, output, isHidden, points]) => ({
      input, output, isHidden: !!isHidden, points: points || 1,
    })),
    explanation: ex || '',
    starterCode: {
      python: starterFor('python', t),
      javascript: starterFor('javascript', t),
      typescript: starterFor('typescript', t),
      java: starterFor('java', t),
      go: starterFor('go', t),
      cpp: starterFor('cpp', t),
      rust: starterFor('rust', t),
    },
    timeLimit: d === 'hard' ? 5000 : 3000,
    memoryLimit: 256,
    isPublished: true,
    isActive: true,
  };
}

const QUESTIONS_PART3 = [
  q('Contains Duplicate', 'easy', 'arrays', ['hash-set'], ['Amazon', 'Google'],
    'Input: n, then n integers. Print "true" if any value appears twice, else "false".',
    '',
    [['4 1 2 3 1', 'true', false, 10], ['4 1 2 3 4', 'false', false, 10], ['1 0', 'false', true, 5]],
    'Insert into a set; if already present, true.'),
  q('Roman to Integer', 'easy', 'math', ['hash-map'], ['Bloomberg', 'Uber'],
    'Input: a Roman numeral. Print its integer value.',
    '',
    [['MCMXCIV', '1994', false, 15], ['LVIII', '58', false, 10], ['IX', '9', true, 5]],
    'If a smaller value precedes a larger one, subtract it.'),
  q('Longest Common Prefix', 'easy', 'strings', ['sorting'], ['Meta'],
    'Input: n, then n words. Print the longest common prefix (empty output if none).',
    '',
    [['3 flower flow flight', 'fl', false, 10], ['2 dog cat', '', false, 5], ['3 interspecies interstellar interstate', 'inters', true, 10]],
    'Compare characters column-wise across all words.'),
  q('Add Binary', 'easy', 'math', ['bit-manipulation'], ['Meta'],
    'Input: two binary strings. Print their sum as a binary string.',
    '',
    [['1010 1011', '10101', false, 10], ['11 1', '100', false, 10], ['0 0', '0', true, 5]],
    'Add from the least significant bit with carry.'),
  q('Plus One', 'easy', 'arrays', ['math'], ['Google'],
    'Input: n, then n digits of a number (most significant first). Print the digits after adding one, space-separated.',
    '',
    [['3 1 2 3', '1 2 4', false, 10], ['1 9', '1 0', false, 10], ['4 9 9 9 9', '1 0 0 0 0', true, 15]],
    'Add carry from the last digit; prepend 1 if carry remains.'),
  q('Power of Two', 'easy', 'math', ['bit-manipulation'], ['Google', 'Amazon'],
    'Input: an integer. Print "true" if it is a power of two, else "false".',
    '',
    [['16', 'true', false, 10], ['3', 'false', false, 10], ['1', 'true', true, 5], ['0', 'false', true, 5]],
    'n > 0 and (n & (n-1)) == 0.'),
  q('Move Zeroes', 'easy', 'arrays', ['two-pointers'], ['Meta', 'Bloomberg'],
    'Input: n, then n integers. Move all zeroes to the end keeping the order of non-zeroes. Print the result space-separated.',
    '',
    [['5 0 1 0 3 12', '1 3 12 0 0', false, 10], ['1 0', '0', false, 5], ['3 4 2 4', '4 2 4', true, 10]],
    'Snowball approach: swap each non-zero with the first zero seen.'),
  q('Merge Two Sorted Lists Values', 'easy', 'linked-lists', ['two-pointers'], ['Amazon'],
    'Input: n, m, then n values of list A, then m values of list B (each sorted). Print the merged sorted values space-separated.',
    '',
    [['3 3 1 2 4 1 3 4', '1 1 2 3 4 4', false, 10], ['0 1 5', '5', false, 10], ['2 2 1 3 2 4', '1 2 3 4', true, 10]],
    'Merge by value like LeetCode 21 but on arrays.'),
  q('Happy Number', 'easy', 'math', ['hash-set'], ['Uber', 'Bloomberg'],
    'Input: n. Repeatedly replace n with the sum of squares of its digits. Print "true" if it reaches 1, else "false".',
    '',
    [['19', 'true', false, 15], ['2', 'false', false, 10], ['7', 'true', true, 10]],
    'Detect the 4-loop with a visited set or Floyd cycle detection.'),
  q('Majority Element', 'easy', 'arrays', ['voting'], ['Amazon', 'Adobe'],
    'Input: n, then n integers. Print the element appearing more than n/2 times.',
    'The majority element always exists.',
    [['3 3 2 3', '3', false, 10], ['5 2 2 1 1 2', '2', false, 10], ['1 8', '8', true, 5]],
    'Boyer-Moore voting: cancel out pairs; the survivor wins.'),
];

const QUESTIONS_PART2 = [
  q('Maximum Subarray', 'easy', 'dynamic-programming', ['kadane'], ['Amazon', 'Google'],
    'Input: n, then n integers. Print the largest sum of any contiguous subarray.',
    '1 <= n <= 10^5',
    [['9 -2 1 -3 4 -1 2 1 -5 4', '6', false, 15], ['1 -1', '1', false, 10], ['5 -3 -1 -2 -4 -5', '-1', true, 15]],
    'Kadane: extend the running sum or restart at the current element.'),
  q('Valid Parentheses', 'easy', 'strings', ['stack'], ['Amazon', 'Meta'],
    'Input: a string of brackets ()[]{}. Print "true" if it is valid, else "false".',
    '',
    [['()[]{}', 'true', false, 10], ['(]', 'false', false, 10], ['([)]', 'false', true, 10], ['{[]}', 'true', true, 10]],
    'Push opens on a stack; each close must match the top.'),
  q('Merge Sorted Arrays', 'easy', 'sorting', ['two-pointers'], ['Microsoft'],
    'Input: n, m, then n sorted integers, then m sorted integers. Print the merged sorted array, space-separated.',
    '',
    [['3 3 1 3 5 2 4 6', '1 2 3 4 5 6', false, 10], ['1 1 2 1', '1 2', false, 10], ['2 2 1 3 2 4', '1 2 3 4', true, 10]],
    'Two-pointer merge like merge sort.'),
  q('First Unique Character', 'easy', 'strings', ['hash-map'], ['Amazon'],
    'Input: a word. Print the index of the first non-repeating character, or -1 if none.',
    '',
    [['leetcode', '0', false, 10], ['aabb', '-1', false, 10], ['loveleetcode', '2', true, 10]],
    'Count frequencies, then scan again for the first char with count 1.'),
  q('Reverse Integer', 'easy', 'math', [], ['Apple', 'Bloomberg'],
    'Input: an integer. Print it with digits reversed; if it overflows a 32-bit signed integer, print 0.',
    '',
    [['123', '321', false, 10], ['-123', '-321', false, 10], ['1534236469', '0', true, 15], ['120', '21', true, 10]],
    'Pop digits with %10 and push with *10; check the 32-bit range before multiplying.'),
  q('Climbing Stairs', 'easy', 'dynamic-programming', ['fibonacci'], ['Google', 'Adobe'],
    'Input: n. You can climb 1 or 2 steps. Print the number of distinct ways to reach step n.',
    '1 <= n <= 45',
    [['5', '8', false, 10], ['2', '2', false, 5], ['45', '1836311903', true, 15]],
    'Fibonacci: ways(n) = ways(n-1) + ways(n-2).'),
  q('Binary Search', 'easy', 'searching', ['binary-search'], ['Everywhere'],
    'Input: n, then n sorted integers, then target. Print the index of target or -1.',
    '',
    [['5 1 3 5 7 9 7', '3', false, 10], ['3 10 20 30 25', '-1', false, 10], ['1 42 42', '0', true, 10]],
    'Standard binary search on the sorted array.'),
  q('Count Primes', 'easy', 'math', ['sieve'], ['Amazon'],
    'Input: n. Print the number of primes strictly less than n.',
    '0 <= n <= 5*10^6',
    [['10', '4', false, 15], ['0', '0', false, 5], ['1', '0', false, 5], ['100', '25', true, 15]],
    'Sieve of Eratosthenes.'),
  q('Missing Number', 'easy', 'arrays', ['math', 'xor'], ['Amazon'],
    'Input: n, then n distinct integers from 0..n. Print the missing number.',
    '',
    [['3 3 0 1', '2', false, 10], ['1 0', '1', false, 5], ['2 1 2', '0', true, 10]],
    'Expected sum n(n+1)/2 minus actual sum, or XOR all.'),
  q('Best Time to Buy and Sell Stock', 'easy', 'dynamic-programming', ['greedy'], ['Amazon', 'Meta'],
    'Input: n, then n prices. Print the maximum profit from one buy and one sell (0 if none).',
    '',
    [['6 7 1 5 3 6 4', '5', false, 10], ['5 7 6 4 3 1', '0', false, 10], ['3 2 4 1', '2', true, 10]],
    'Track min price so far; profit = price - min.'),
];

// ── Questions part 1 (easy) ────────────────────────────────────────────────
const QUESTIONS_PART1 = [
  q('Two Sum', 'easy', 'arrays', ['hash-map'], ['Google', 'Amazon'],
    'Input: n, then n integers (the array), then target. Print the 0-based indices of the two numbers that add up to target, space-separated.',
    'Exactly one solution exists; do not reuse an element.',
    [['4 2 7 11 15 9', '0 1', false, 10], ['3 3 2 4 6', '1 2', false, 10], ['5 1 5 3 5 8 6', '0 1', true, 10]],
    'Use a hash map of value-to-index; for each element check if target - element was seen.'),
  q('Reverse String', 'easy', 'strings', ['two-pointers'], ['Amazon'],
    'Input: a single word. Print it reversed.',
    '1 <= length <= 10^5',
    [['hello', 'olleh', false, 5], ['a', 'a', false, 5], ['Interview', 'weivretnI', true, 5]],
    'Two pointers from both ends swapping, or reverse the string in your language.'),
  q('Valid Palindrome', 'easy', 'strings', ['two-pointers'], ['Meta', 'Microsoft'],
    'Input: a phrase as one token (symbols removed, case-insensitive letters/digits only). Print "true" if it is a palindrome, else "false".',
    '',
    [['AmanaplanacanalPanama', 'true', false, 10], ['raceacar', 'false', false, 10], ['0P', 'false', true, 10]],
    'Filter to alphanumeric lowercase, then two-pointer compare.'),
];

// ── Questions part 4 (medium) ──────────────────────────────────────────────
const QUESTIONS_PART4 = [
  q('Product of Array Except Self', 'medium', 'arrays', ['prefix-sum'], ['Amazon', 'Meta'],
    'Input: n, then n integers. Print the product of all elements except self for each position, space-separated.',
    'Division is not allowed; O(n) expected.',
    [['4 1 2 3 4', '24 12 8 6', false, 20], ['3 -1 1 0', '0 0 -1', false, 20], ['2 5 3', '3 5', true, 20]],
    'Prefix products left-to-right, then suffix products right-to-left.'),
  q('Group Anagrams', 'medium', 'strings', ['hash-map'], ['Amazon', 'Meta', 'Bloomberg'],
    'Input: n, then n words. Group the anagrams. Print each group on its own line (words space-separated, groups in order of first appearance).',
    '',
    [['6 eat tea tan ate nat bat', 'eat tea ate tan nat bat', false, 25], ['2 abc bca', 'abc bca', false, 15], ['3 add dad da', 'add da dad', true, 25]],
    'Key each word by its sorted letters; group with a hash map.'),
  q('Longest Substring Without Repeating Characters', 'medium', 'strings', ['sliding-window'], ['Amazon', 'Meta', 'Google'],
    'Input: a string. Print the length of the longest substring without repeating characters.',
    '',
    [['abcabcbb', '3', false, 25], ['bbbbb', '1', false, 15], ['pwwkew', '3', false, 20], ['dvdf', '3', true, 25]],
    'Sliding window with a last-seen-index map; move the left edge past duplicates.'),
  q('Container With Most Water', 'medium', 'arrays', ['two-pointers'], ['Amazon', 'Google'],
    'Input: n, then n heights. Print the maximum water area between two lines.',
    '',
    [['9 1 8 6 2 5 4 8 3 7', '49', false, 25], ['2 1 1', '1', false, 15], ['4 4 3 2 7', '9', true, 25]],
    'Two pointers at the ends; always move the shorter line inward.'),
  q('3Sum', 'medium', 'arrays', ['two-pointers', 'sorting'], ['Meta', 'Amazon', 'Adobe'],
    'Input: n, then n integers. Count the number of unique triplets that sum to 0. Print the count.',
    '',
    [['6 -1 0 1 2 -1 -4', '2', false, 30], ['3 0 0 0', '1', false, 20], ['5 -2 -2 -1 3 4', '2', true, 30]],
    'Sort, fix one element, two-pointer scan; skip duplicate values.'),
  q('Rotate Image', 'medium', 'arrays', ['matrix'], ['Microsoft', 'Amazon'],
    'Input: n, then n*n integers (row-major). Rotate the matrix 90 degrees clockwise and print it row by row.',
    'In-place if possible.',
    [['2 1 2 3 4', '3 1\\n4 2', false, 25], ['1 5', '5', false, 10], ['3 1 2 3 4 5 6 7 8 9', '7 4 1\\n8 5 2\\n9 6 3', true, 30]],
    'Transpose, then reverse each row.'),
  q('Coin Change', 'medium', 'dynamic-programming', ['dp'], ['Amazon', 'Meta', 'Google'],
    'Input: k, then k coin values, then amount. Print the fewest coins to make amount, or -1.',
    '',
    [['3 1 2 5 11', '3', false, 30], ['2 2 3', '-1', false, 20], ['1 1 0', '0', false, 15], ['3 1 5 7 18', '4', true, 30]],
    'Bottom-up DP: dp[a] = min(dp[a], dp[a-coin]+1).'),
  q('Unique Paths', 'medium', 'dynamic-programming', ['dp', 'combinatorics'], ['Google', 'Meta'],
    'Input: m n (grid rows, columns). Robot moves only right or down. Print the number of unique paths.',
    '',
    [['3 7', '28', false, 25], ['2 2', '2', false, 15], ['3 3', '6', true, 25]],
    'dp[i][j] = dp[i-1][j] + dp[i][j-1]; or C(m+n-2, m-1).'),
  q('House Robber', 'medium', 'dynamic-programming', ['dp'], ['Amazon', 'Adobe'],
    'Input: n, then n money amounts. Cannot rob adjacent houses. Print the max loot.',
    '',
    [['5 2 7 9 3 1', '12', false, 25], ['2 1 2', '2', false, 15], ['4 2 1 1 2', '4', true, 25]],
    'Two rolling variables: rob vs skip.'),
  q('Number of Islands', 'medium', 'graphs', ['dfs', 'bfs'], ['Amazon', 'Google', 'Meta'],
    'Input: m n, then m rows of 0/1 grid digits (no spaces). Print the number of islands.',
    '',
    [['4 5 11110 11010 11000 00000', '1', false, 30], ['2 2 10 01', '2', false, 20], ['3 3 101 010 101', '5', true, 30]],
    'Flood-fill (DFS/BFS) each unvisited land cell.'),
];

// ── Questions part 5 (hard) ────────────────────────────────────────────────
const QUESTIONS_PART5 = [
  q('Median of Two Sorted Arrays', 'hard', 'searching', ['binary-search'], ['Google', 'Amazon', 'Meta'],
    'Input: n, m, then n sorted integers, then m sorted integers. Print the median of the two combined sorted arrays (as a decimal if fractional, e.g. 2.5).',
    'O(log(n+m)) expected.',
    [['2 2 1 3 2 4', '2.5', false, 40], ['2 1 1 3 2', '2', false, 25], ['1 1 1 1 2', '1.5', true, 40]],
    'Binary search the partition of the smaller array so the halves are balanced.'),
  q('Trapping Rain Water', 'hard', 'arrays', ['two-pointers'], ['Amazon', 'Google', 'Meta'],
    'Input: n, then n elevation heights. Print the total trapped rainwater.',
    '',
    [['12 0 1 0 2 1 0 1 3 2 1 2 1', '6', false, 40], ['6 4 2 0 3 2 5', '9', false, 30], ['3 3 0 3', '3', true, 40]],
    'Two pointers with running left/right max; water at each bar is min(lmax,rmax)-height.'),
  q('Edit Distance', 'hard', 'dynamic-programming', ['dp'], ['Google', 'Microsoft'],
    'Input: two words. Print the minimum number of single-character edits (insert/delete/replace) to convert word1 to word2.',
    '',
    [['horse ros', '3', false, 40], ['intention execution', '5', false, 30], ['abc abc', '0', true, 30]],
    'Classic 2D DP on prefixes of both words.'),
  q('Longest Increasing Subsequence', 'medium', 'dynamic-programming', ['dp', 'binary-search'], ['Microsoft', 'Amazon'],
    'Input: n, then n integers. Print the length of the longest strictly increasing subsequence.',
    '',
    [['8 10 9 2 5 3 7 101 18', '4', false, 35], ['4 0 1 0 3', '2', false, 25], ['6 7 7 7 7 7 7', '1', true, 35]],
    'Patience sorting with binary search — O(n log n).'),
  q('Word Break', 'medium', 'dynamic-programming', ['dp'], ['Amazon', 'Meta'],
    'Input: k, then k dictionary words, then a sentence (single token). Print "true" if the sentence can be segmented into dictionary words.',
    '',
    [['2 apple pie applepie', 'true', false, 30], ['2 apple pie applebanana', 'false', false, 20], ['3 cat sand catsand catsanddog', 'true', true, 30]],
    'dp[i] = any j where dp[j] and s[j..i) is in the dictionary.'),
  q('Largest Rectangle in Histogram', 'hard', 'stacks', ['monotonic-stack'], ['Amazon', 'Bloomberg'],
    'Input: n, then n bar heights. Print the largest rectangle area in the histogram.',
    '',
    [['6 2 1 5 6 2 3', '10', false, 40], ['2 2 4', '4', false, 25], ['1 5', '5', true, 40]],
    'Monotonic stack of increasing heights; pop and compute areas.'),
  q('Merge K Sorted Arrays', 'hard', 'sorting', ['heap'], ['Amazon', 'Meta', 'Microsoft'],
    'Input: k, then for each array its size n followed by n sorted integers. Print all values merged in sorted order, space-separated.',
    '',
    [['3 3 1 4 5 3 2 6 7 2 3 9', '1 2 3 3 4 5 6 7 9', false, 40], ['2 2 1 3 1 2', '1 2 3', false, 25], ['1 1 7', '7', true, 25]],
    'Min-heap of (value, array, index) — O(N log k).'),
  q('Course Schedule', 'medium', 'graphs', ['topological-sort'], ['Google', 'Amazon'],
    'Input: numCourses, p, then p prerequisite pairs [a, b] meaning b before a (0-indexed). Print "true" if all courses can be finished.',
    '',
    [['2 1 1 0', 'true', false, 30], ['2 1 0 1', 'false', false, 20], ['4 3 0 1 1 2 2 3', 'true', true, 30]],
    'Topological sort (Kahn BFS) — finishable iff the graph is acyclic.'),
  q('Kth Largest Element', 'medium', 'sorting', ['heap', 'quickselect'], ['Meta', 'Amazon'],
    'Input: n k, then n integers. Print the k-th largest element.',
    '',
    [['6 2 3 2 1 5 6 4', '5', false, 30], ['3 1 3 1 2', '3', false, 20], ['5 4 7 10 4 3 20 15', '4', true, 30]],
    'Sort, or maintain a min-heap of size k.'),
  q('LRU Cache Hit Count', 'hard', 'design', ['lru', 'linked-list'], ['Meta', 'Amazon', 'Bloomberg'],
    'Input: capacity, q, then q operations each "get x" or "put x". Track a single integer value per key. Print the number of GET operations that returned a cached (non-evicted) key.',
    '',
    [['2 5 put 1 put 2 get 1 get 3 put 3', '1', false, 40], ['1 4 put 5 get 5 get 6 get 5', '2', false, 30], ['2 6 put 1 put 2 get 1 put 3 get 2 get 1', '2', true, 40]],
    'Simulate with an ordered map / linked-hash set; count hits on get.'),
];

// ── Runner ─────────────────────────────────────────────────────────────────
const ALL_QUESTIONS = [
  ...QUESTIONS_PART1, ...QUESTIONS_PART3, ...QUESTIONS_PART2,
  ...QUESTIONS_PART4, ...QUESTIONS_PART5,
];

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hireadyDB';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  let inserted = 0, updated = 0, skipped = 0;
  for (const doc of ALL_QUESTIONS) {
    try {
      const res = await CodingQuestion.updateOne(
        { slug: doc.slug },
        { $setOnInsert: doc },
        { upsert: true }
      );
      if (res.upsertedCount) inserted++;
      else skipped++;
    } catch (err) {
      console.error(`✗ ${doc.title}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed, ${ALL_QUESTIONS.length} total in file.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});