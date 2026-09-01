require('dotenv').config();
const mongoose = require('mongoose');
const CodingQuestion = require('../models/CodingQuestion');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

const questions = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    description: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
    difficulty: 'easy',
    tags: ['array', 'hash-table'],
    category: 'arrays',
    companies: ['Google', 'Amazon', 'Microsoft', 'Apple', 'Meta'],
    starterCode: {
      python: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        # Write your solution here\n        pass',
      javascript: 'var twoSum = function(nums, target) {\n    // Write your solution here\n};',
      typescript: 'function twoSum(nums: number[], target: number): number[] {\n    // Write your solution here\n}',
      java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write your solution here\n        return new int[0];\n    }\n}',
      go: 'func twoSum(nums []int, target int) []int {\n    // Write your solution here\n    return []int{}\n}',
      cpp: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};',
      rust: 'impl Solution {\n    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {\n        // Write your solution here\n        vec![]\n    }\n}',
    },
    solution: {
      python: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        num_map = {}\n        for i, num in enumerate(nums):\n            complement = target - num\n            if complement in num_map:\n                return [num_map[complement], i]\n            num_map[num] = i\n        return []',
      javascript: 'var twoSum = function(nums, target) {\n    const map = new Map();\n    for (let i = 0; i < nums.length; i++) {\n        const complement = target - nums[i];\n        if (map.has(complement)) {\n            return [map.get(complement), i];\n        }\n        map.set(nums[i], i);\n    }\n    return [];\n};',
      typescript: 'function twoSum(nums: number[], target: number): number[] {\n    const map = new Map<number, number>();\n    for (let i = 0; i < nums.length; i++) {\n        const complement = target - nums[i];\n        if (map.has(complement)) {\n            return [map.get(complement)!, i];\n        }\n        map.set(nums[i], i);\n    }\n    return [];\n}',
      java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        Map<Integer, Integer> map = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            int complement = target - nums[i];\n            if (map.containsKey(complement)) {\n                return new int[]{map.get(complement), i};\n            }\n            map.put(nums[i], i);\n        }\n        return new int[0];\n    }\n}',
      go: 'func twoSum(nums []int, target int) []int {\n    m := make(map[int]int)\n    for i, num := range nums {\n        complement := target - num\n        if j, ok := m[complement]; ok {\n            return []int{j, i}\n        }\n        m[num] = i\n    }\n    return []int{}\n}',
      cpp: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int, int> map;\n        for (int i = 0; i < nums.size(); i++) {\n            int complement = target - nums[i];\n            if (map.count(complement)) {\n                return {map[complement], i};\n            }\n            map[nums[i]] = i;\n        }\n        return {};\n    }\n};',
      rust: 'impl Solution {\n    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {\n        use std::collections::HashMap;\n        let mut map = HashMap::new();\n        for (i, &num) in nums.iter().enumerate() {\n            let complement = target - num;\n            if let Some(&j) = map.get(&complement) {\n                return vec![j as i32, i as i32];\n            }\n            map.insert(num, i);\n        }\n        vec![]\n    }\n}',
    },
    testCases: [
      { input: '[2,7,11,15]\n9', output: '[0,1]', isHidden: false, points: 1, description: 'Example 1' },
      { input: '[3,2,4]\n6', output: '[1,2]', isHidden: false, points: 1, description: 'Example 2' },
      { input: '[3,3]\n6', output: '[0,1]', isHidden: false, points: 1, description: 'Example 3' },
      { input: '[1,2,3,4,5]\n9', output: '[3,4]', isHidden: true, points: 1, description: 'Hidden test 1' },
      { input: '[-1,-2,-3,-4,-5]\n-8', output: '[2,4]', isHidden: true, points: 1, description: 'Hidden test 2' },
    ],
    constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9\nOnly one valid answer exists.',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: 'Use a hash map to store each number and its index. For each number, check if its complement (target - num) exists in the map. This gives O(n) time and O(n) space complexity.',
    isPublished: true,
    isActive: true,
  },
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    description: `Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.`,
    difficulty: 'easy',
    tags: ['string', 'stack'],
    category: 'strings',
    companies: ['Google', 'Amazon', 'Microsoft', 'Bloomberg'],
    starterCode: {
      python: 'class Solution:\n    def isValid(self, s: str) -> bool:\n        # Write your solution here\n        pass',
      javascript: 'var isValid = function(s) {\n    // Write your solution here\n};',
      typescript: 'function isValid(s: string): boolean {\n    // Write your solution here\n    return false;\n}',
      java: 'class Solution {\n    public boolean isValid(String s) {\n        // Write your solution here\n        return false;\n    }\n}',
      go: 'func isValid(s string) bool {\n    // Write your solution here\n    return false\n}',
      cpp: 'class Solution {\npublic:\n    bool isValid(string s) {\n        // Write your solution here\n        return false;\n    }\n};',
      rust: 'impl Solution {\n    pub fn is_valid(s: String) -> bool {\n        // Write your solution here\n        false\n    }\n}',
    },
    solution: {
      python: 'class Solution:\n    def isValid(self, s: str) -> bool:\n        stack = []\n        mapping = {")": "(", "}": "{", "]": "["}\n        for char in s:\n            if char in mapping:\n                if not stack or stack.pop() != mapping[char]:\n                    return False\n            else:\n                stack.append(char)\n        return not stack',
      javascript: 'var isValid = function(s) {\n    const stack = [];\n    const map = { ")": "(", "}": "{", "]": "[" };\n    for (const char of s) {\n        if (map[char]) {\n            if (stack.pop() !== map[char]) return false;\n        } else {\n            stack.push(char);\n        }\n    }\n    return stack.length === 0;\n};',
      typescript: 'function isValid(s: string): boolean {\n    const stack: string[] = [];\n    const map: Record<string, string> = { ")": "(", "}": "{", "]": "[" };\n    for (const char of s) {\n        if (map[char]) {\n            if (stack.pop() !== map[char]) return false;\n        } else {\n            stack.push(char);\n        }\n    }\n    return stack.length === 0;\n}',
      java: 'class Solution {\n    public boolean isValid(String s) {\n        Stack<Character> stack = new Stack<>();\n        Map<Character, Character> map = Map.of(\')\', \'(\', \'}\', \'{\', \']\', \'[\');\n        for (char c : s.toCharArray()) {\n            if (map.containsKey(c)) {\n                if (stack.isEmpty() || stack.pop() != map.get(c)) return false;\n            } else {\n                stack.push(c);\n            }\n        }\n        return stack.isEmpty();\n    }\n}',
      go: 'func isValid(s string) bool {\n    stack := []rune{}\n    pairs := map[rune]rune{")": "(", "}": "{", "]": "["}\n    for _, c := range s {\n        if open, ok := pairs[c]; ok {\n            if len(stack) == 0 || stack[len(stack)-1] != open {\n                return false\n            }\n            stack = stack[:len(stack)-1]\n        } else {\n            stack = append(stack, c)\n        }\n    }\n    return len(stack) == 0\n}',
      cpp: 'class Solution {\npublic:\n    bool isValid(string s) {\n        stack<char> st;\n        unordered_map<char, char> map = {{")", "("}, {"}", "{"}, {"]", "["}};\n        for (char c : s) {\n            if (map.count(c)) {\n                if (st.empty() || st.top() != map[c]) return false;\n                st.pop();\n            } else {\n                st.push(c);\n            }\n        }\n        return st.empty();\n    }\n};',
      rust: 'impl Solution {\n    pub fn is_valid(s: String) -> bool {\n        let mut stack = Vec::new();\n        let pairs = [(")", "("), ("}", "{"), ("]", "[")];\n        for c in s.chars() {\n            if let Some(&open) = pairs.iter().find(|&&(close, _)| close == c.to_string()).map(|(_, open)| open) {\n                if stack.pop() != Some(open.chars().next().unwrap()) {\n                    return false;\n                }\n            } else {\n                stack.push(c);\n            }\n        }\n        stack.is_empty()\n    }\n}',
    },
    testCases: [
      { input: '()', output: 'true', isHidden: false, points: 1, description: 'Simple valid' },
      { input: '()[]{}', output: 'true', isHidden: false, points: 1, description: 'Multiple types' },
      { input: '(]', output: 'false', isHidden: false, points: 1, description: 'Mismatched' },
      { input: '([)]', output: 'false', isHidden: true, points: 1, description: 'Wrong order' },
      { input: '{[]}', output: 'true', isHidden: true, points: 1, description: 'Nested' },
    ],
    constraints: '1 <= s.length <= 10^4\ns consists of parentheses only \'()[]{}\'.',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: 'Use a stack to track opening brackets. When encountering a closing bracket, check if it matches the top of the stack. O(n) time, O(n) space.',
    isPublished: true,
    isActive: true,
  },
  {
    title: 'Merge Two Sorted Lists',
    slug: 'merge-two-sorted-lists',
    description: `You are given the heads of two sorted linked lists list1 and list2.

Merge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists.

Return the head of the merged linked list.`,
    difficulty: 'easy',
    tags: ['linked-list', 'recursion'],
    category: 'linked-lists',
    companies: ['Amazon', 'Microsoft', 'Apple', 'Google'],
    starterCode: {
      python: '# Definition for singly-linked list.\n# class ListNode:\n#     def __init__(self, val=0, next=None):\n#         self.val = val\n#         self.next = next\nclass Solution:\n    def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:\n        # Write your solution here\n        pass',
      javascript: 'var mergeTwoLists = function(list1, list2) {\n    // Write your solution here\n};',
      typescript: 'function mergeTwoLists(list1: ListNode | null, list2: ListNode | null): ListNode | null {\n    // Write your solution here\n    return null;\n}',
      java: 'class Solution {\n    public ListNode mergeTwoLists(ListNode list1, ListNode list2) {\n        // Write your solution here\n        return null;\n    }\n}',
      go: 'func mergeTwoLists(list1 *ListNode, list2 *ListNode) *ListNode {\n    // Write your solution here\n    return nil\n}',
      cpp: 'class Solution {\npublic:\n    ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {\n        // Write your solution here\n        return nullptr;\n    }\n};',
      rust: 'impl Solution {\n    pub fn merge_two_lists(list1: Option<Box<ListNode>>, list2: Option<Box<ListNode>>) -> Option<Box<ListNode>> {\n        // Write your solution here\n        None\n    }\n}',
    },
    solution: {
      python: '# Definition for singly-linked list.\n# class ListNode:\n#     def __init__(self, val=0, next=None):\n#         self.val = val\n#         self.next = next\nclass Solution:\n    def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:\n        dummy = ListNode()\n        tail = dummy\n        while list1 and list2:\n            if list1.val < list2.val:\n                tail.next = list1\n                list1 = list1.next\n            else:\n                tail.next = list2\n                list2 = list2.next\n            tail = tail.next\n        tail.next = list1 or list2\n        return dummy.next',
      javascript: 'var mergeTwoLists = function(list1, list2) {\n    const dummy = { val: 0, next: null };\n    let tail = dummy;\n    while (list1 && list2) {\n        if (list1.val < list2.val) {\n            tail.next = list1;\n            list1 = list1.next;\n        } else {\n            tail.next = list2;\n            list2 = list2.next;\n        }\n        tail = tail.next;\n    }\n    tail.next = list1 || list2;\n    return dummy.next;\n};',
      typescript: 'function mergeTwoLists(list1: ListNode | null, list2: ListNode | null): ListNode | null {\n    const dummy: ListNode = { val: 0, next: null };\n    let tail: ListNode = dummy;\n    while (list1 && list2) {\n        if (list1.val < list2.val) {\n            tail.next = list1;\n            list1 = list1.next;\n        } else {\n            tail.next = list2;\n            list2 = list2.next;\n        }\n        tail = tail.next;\n    }\n    tail.next = list1 || list2;\n    return dummy.next;\n}',
      java: 'class Solution {\n    public ListNode mergeTwoLists(ListNode list1, ListNode list2) {\n        ListNode dummy = new ListNode(0);\n        ListNode tail = dummy;\n        while (list1 != null && list2 != null) {\n            if (list1.val < list2.val) {\n                tail.next = list1;\n                list1 = list1.next;\n            } else {\n                tail.next = list2;\n                list2 = list2.next;\n            }\n            tail = tail.next;\n        }\n        tail.next = (list1 != null) ? list1 : list2;\n        return dummy.next;\n    }\n}',
      go: 'func mergeTwoLists(list1 *ListNode, list2 *ListNode) *ListNode {\n    dummy := &ListNode{}\n    tail := dummy\n    for list1 != nil && list2 != nil {\n        if list1.Val < list2.Val {\n            tail.Next = list1\n            list1 = list1.Next\n        } else {\n            tail.Next = list2\n            list2 = list2.Next\n        }\n        tail = tail.Next\n    }\n    if list1 != nil {\n        tail.Next = list1\n    } else {\n        tail.Next = list2\n    }\n    return dummy.Next\n}',
      cpp: 'class Solution {\npublic:\n    ListNode* mergeTwoLists(ListNode* list1, ListNode* list2) {\n        ListNode dummy(0);\n        ListNode* tail = &dummy;\n        while (list1 && list2) {\n            if (list1->val < list2->val) {\n                tail->next = list1;\n                list1 = list1->next;\n            } else {\n                tail->next = list2;\n                list2 = list2->next;\n            }\n            tail = tail->next;\n        }\n        tail->next = list1 ? list1 : list2;\n        return dummy.next;\n    }\n};',
      rust: 'impl Solution {\n    pub fn merge_two_lists(list1: Option<Box<ListNode>>, list2: Option<Box<ListNode>>) -> Option<Box<ListNode>> {\n        let mut dummy = Box::new(ListNode::new(0));\n        let mut tail = &mut dummy;\n        let (mut l1, mut l2) = (list1, list2);\n        while l1.is_some() && l2.is_some() {\n            if l1.as_ref().unwrap().val < l2.as_ref().unwrap().val {\n                tail.next = l1;\n                l1 = tail.next.as_mut().unwrap().next.take();\n            } else {\n                tail.next = l2;\n                l2 = tail.next.as_mut().unwrap().next.take();\n            }\n            tail = tail.next.as_mut().unwrap();\n        }\n        tail.next = if l1.is_some() { l1 } else { l2 };\n        dummy.next\n    }\n}',
    },
    testCases: [
      { input: '[1,2,4]\n[1,3,4]', output: '[1,1,2,3,4,4]', isHidden: false, points: 1, description: 'Example 1' },
      { input: '[]\n[]', output: '[]', isHidden: false, points: 1, description: 'Both empty' },
      { input: '[]\n[0]', output: '[0]', isHidden: false, points: 1, description: 'One empty' },
      { input: '[1,2,3]\n[4,5,6]', output: '[1,2,3,4,5,6]', isHidden: true, points: 1, description: 'Non-overlapping' },
      { input: '[1,1,1]\n[1,1,1]', output: '[1,1,1,1,1,1]', isHidden: true, points: 1, description: 'All same values' },
    ],
    constraints: 'The number of nodes in both lists is in the range [0, 50].\n-100 <= Node.val <= 100\nBoth list1 and list2 are sorted in non-decreasing order.',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: 'Use a dummy head and iterate through both lists, always attaching the smaller node. O(n+m) time, O(1) space (excluding output).',
    isPublished: true,
    isActive: true,
  },
  {
    title: 'Maximum Subarray',
    slug: 'maximum-subarray',
    description: `Given an integer array nums, find the subarray with the largest sum, and return its sum.

A subarray is a contiguous non-empty sequence of elements within an array.`,
    difficulty: 'medium',
    tags: ['array', 'dynamic-programming', 'divide-and-conquer'],
    category: 'dynamic-programming',
    companies: ['Google', 'Amazon', 'Microsoft', 'LinkedIn', 'Apple'],
    starterCode: {
      python: 'class Solution:\n    def maxSubArray(self, nums: List[int]) -> int:\n        # Write your solution here\n        pass',
      javascript: 'var maxSubArray = function(nums) {\n    // Write your solution here\n};',
      typescript: 'function maxSubArray(nums: number[]): number {\n    // Write your solution here\n    return 0;\n}',
      java: 'class Solution {\n    public int maxSubArray(int[] nums) {\n        // Write your solution here\n        return 0;\n    }\n}',
      go: 'func maxSubArray(nums []int) int {\n    // Write your solution here\n    return 0\n}',
      cpp: 'class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        // Write your solution here\n        return 0;\n    }\n};',
      rust: 'impl Solution {\n    pub fn max_sub_array(nums: Vec<i32>) -> i32 {\n        // Write your solution here\n        0\n    }\n}',
    },
    solution: {
      python: 'class Solution:\n    def maxSubArray(self, nums: List[int]) -> int:\n        max_sum = current_sum = nums[0]\n        for num in nums[1:]:\n            current_sum = max(num, current_sum + num)\n            max_sum = max(max_sum, current_sum)\n        return max_sum',
      javascript: 'var maxSubArray = function(nums) {\n    let maxSum = nums[0];\n    let currentSum = nums[0];\n    for (let i = 1; i < nums.length; i++) {\n        currentSum = Math.max(nums[i], currentSum + nums[i]);\n        maxSum = Math.max(maxSum, currentSum);\n    }\n    return maxSum;\n};',
      typescript: 'function maxSubArray(nums: number[]): number {\n    let maxSum = nums[0];\n    let currentSum = nums[0];\n    for (let i = 1; i < nums.length; i++) {\n        currentSum = Math.max(nums[i], currentSum + nums[i]);\n        maxSum = Math.max(maxSum, currentSum);\n    }\n    return maxSum;\n}',
      java: 'class Solution {\n    public int maxSubArray(int[] nums) {\n        int maxSum = nums[0];\n        int currentSum = nums[0];\n        for (int i = 1; i < nums.length; i++) {\n            currentSum = Math.max(nums[i], currentSum + nums[i]);\n            maxSum = Math.max(maxSum, currentSum);\n        }\n        return maxSum;\n    }\n}',
      go: 'func maxSubArray(nums []int) int {\n    maxSum := nums[0]\n    currentSum := nums[0]\n    for i := 1; i < len(nums); i++ {\n        if currentSum+nums[i] > nums[i] {\n            currentSum += nums[i]\n        } else {\n            currentSum = nums[i]\n        }\n        if currentSum > maxSum {\n            maxSum = currentSum\n        }\n    }\n    return maxSum\n}',
      cpp: 'class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        int maxSum = nums[0];\n        int currentSum = nums[0];\n        for (int i = 1; i < nums.size(); i++) {\n            currentSum = max(nums[i], currentSum + nums[i]);\n            maxSum = max(maxSum, currentSum);\n        }\n        return maxSum;\n    }\n};',
      rust: 'impl Solution {\n    pub fn max_sub_array(nums: Vec<i32>) -> i32 {\n        let mut max_sum = nums[0];\n        let mut current_sum = nums[0];\n        for &num in nums.iter().skip(1) {\n            current_sum = current_sum.max(current_sum + num);\n            max_sum = max_sum.max(current_sum);\n        }\n        max_sum\n    }\n}',
    },
    testCases: [
      { input: '[-2,1,-3,4,-1,2,1,-5,4]', output: '6', isHidden: false, points: 1, description: 'Example 1' },
      { input: '[1]', output: '1', isHidden: false, points: 1, description: 'Single element' },
      { input: '[5,4,-1,7,8]', output: '23', isHidden: false, points: 1, description: 'All positive' },
      { input: '[-1,-2,-3,-4]', output: '-1', isHidden: true, points: 1, description: 'All negative' },
      { input: '[1,2,3,4,5]', output: '15', isHidden: true, points: 1, description: 'All positive increasing' },
    ],
    constraints: '1 <= nums.length <= 10^5\n-10^4 <= nums[i] <= 10^4',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: "Kadane's algorithm: keep track of max sum ending at current position. Either extend previous subarray or start new. O(n) time, O(1) space.",
    isPublished: true,
    isActive: true,
  },
  {
    title: 'Climbing Stairs',
    slug: 'climbing-stairs',
    description: `You are climbing a staircase. It takes n steps to reach the top.

Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?`,
    difficulty: 'easy',
    tags: ['dynamic-programming', 'math'],
    category: 'dynamic-programming',
    companies: ['Google', 'Amazon', 'Microsoft', 'Apple', 'Adobe'],
    starterCode: {
      python: 'class Solution:\n    def climbStairs(self, n: int) -> int:\n        # Write your solution here\n        pass',
      javascript: 'var climbStairs = function(n) {\n    // Write your solution here\n};',
      typescript: 'function climbStairs(n: number): number {\n    // Write your solution here\n    return 0;\n}',
      java: 'class Solution {\n    public int climbStairs(int n) {\n        // Write your solution here\n        return 0;\n    }\n}',
      go: 'func climbStairs(n int) int {\n    // Write your solution here\n    return 0\n}',
      cpp: 'class Solution {\npublic:\n    int climbStairs(int n) {\n        // Write your solution here\n        return 0;\n    }\n};',
      rust: 'impl Solution {\n    pub fn climb_stairs(n: i32) -> i32 {\n        // Write your solution here\n        0\n    }\n}',
    },
    solution: {
      python: 'class Solution:\n    def climbStairs(self, n: int) -> int:\n        if n <= 2:\n            return n\n        a, b = 1, 2\n        for _ in range(3, n + 1):\n            a, b = b, a + b\n        return b',
      javascript: 'var climbStairs = function(n) {\n    if (n <= 2) return n;\n    let a = 1, b = 2;\n    for (let i = 3; i <= n; i++) {\n        [a, b] = [b, a + b];\n    }\n    return b;\n};',
      typescript: 'function climbStairs(n: number): number {\n    if (n <= 2) return n;\n    let a = 1, b = 2;\n    for (let i = 3; i <= n; i++) {\n        [a, b] = [b, a + b];\n    }\n    return b;\n}',
      java: 'class Solution {\n    public int climbStairs(int n) {\n        if (n <= 2) return n;\n        int a = 1, b = 2;\n        for (int i = 3; i <= n; i++) {\n            int temp = a + b;\n            a = b;\n            b = temp;\n        }\n        return b;\n    }\n}',
      go: 'func climbStairs(n int) int {\n    if n <= 2 {\n        return n\n    }\n    a, b := 1, 2\n    for i := 3; i <= n; i++ {\n        a, b = b, a+b\n    }\n    return b\n}',
      cpp: 'class Solution {\npublic:\n    int climbStairs(int n) {\n        if (n <= 2) return n;\n        int a = 1, b = 2;\n        for (int i = 3; i <= n; i++) {\n            int temp = a + b;\n            a = b;\n            b = temp;\n        }\n        return b;\n    }\n};',
      rust: 'impl Solution {\n    pub fn climb_stairs(n: i32) -> i32 {\n        if n <= 2 {\n            return n;\n        }\n        let (mut a, mut b) = (1, 2);\n        for _ in 3..=n {\n            let temp = a + b;\n            a = b;\n            b = temp;\n        }\n        b\n    }\n}',
    },
    testCases: [
      { input: '2', output: '2', isHidden: false, points: 1, description: 'n=2' },
      { input: '3', output: '3', isHidden: false, points: 1, description: 'n=3' },
      { input: '1', output: '1', isHidden: false, points: 1, description: 'n=1' },
      { input: '5', output: '8', isHidden: true, points: 1, description: 'n=5' },
      { input: '10', output: '89', isHidden: true, points: 1, description: 'n=10' },
    ],
    constraints: '1 <= n <= 45',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: 'This is the Fibonacci sequence. ways(n) = ways(n-1) + ways(n-2). Use iterative DP with O(1) space. O(n) time.',
    isPublished: true,
    isActive: true,
  },
  {
    title: 'Longest Substring Without Repeating Characters',
    slug: 'longest-substring-without-repeating-characters',
    description: `Given a string s, find the length of the longest substring without repeating characters.`,
    difficulty: 'medium',
    tags: ['string', 'sliding-window', 'hash-table'],
    category: 'strings',
    companies: ['Google', 'Amazon', 'Microsoft', 'Facebook', 'Bloomberg'],
    starterCode: {
      python: 'class Solution:\n    def lengthOfLongestSubstring(self, s: str) -> int:\n        # Write your solution here\n        pass',
      javascript: 'var lengthOfLongestSubstring = function(s) {\n    // Write your solution here\n};',
      typescript: 'function lengthOfLongestSubstring(s: string): number {\n    // Write your solution here\n    return 0;\n}',
      java: 'class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        // Write your solution here\n        return 0;\n    }\n}',
      go: 'func lengthOfLongestSubstring(s string) int {\n    // Write your solution here\n    return 0\n}',
      cpp: 'class Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        // Write your solution here\n        return 0;\n    }\n};',
      rust: 'impl Solution {\n    pub fn length_of_longest_substring(s: String) -> i32 {\n        // Write your solution here\n        0\n    }\n}',
    },
    solution: {
      python: 'class Solution:\n    def lengthOfLongestSubstring(self, s: str) -> int:\n        char_index = {}\n        left = 0\n        max_len = 0\n        for right, char in enumerate(s):\n            if char in char_index and char_index[char] >= left:\n                left = char_index[char] + 1\n            char_index[char] = right\n            max_len = max(max_len, right - left + 1)\n        return max_len',
      javascript: 'var lengthOfLongestSubstring = function(s) {\n    const map = new Map();\n    let left = 0, maxLen = 0;\n    for (let right = 0; right < s.length; right++) {\n        const char = s[right];\n        if (map.has(char) && map.get(char) >= left) {\n            left = map.get(char) + 1;\n        }\n        map.set(char, right);\n        maxLen = Math.max(maxLen, right - left + 1);\n    }\n    return maxLen;\n};',
      typescript: 'function lengthOfLongestSubstring(s: string): number {\n    const map = new Map<string, number>();\n    let left = 0, maxLen = 0;\n    for (let right = 0; right < s.length; right++) {\n        const char = s[right];\n        if (map.has(char) && map.get(char)! >= left) {\n            left = map.get(char)! + 1;\n        }\n        map.set(char, right);\n        maxLen = Math.max(maxLen, right - left + 1);\n    }\n    return maxLen;\n}',
      java: 'class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        Map<Character, Integer> map = new HashMap<>();\n        int left = 0, maxLen = 0;\n        for (int right = 0; right < s.length(); right++) {\n            char c = s.charAt(right);\n            if (map.containsKey(c) && map.get(c) >= left) {\n                left = map.get(c) + 1;\n            }\n            map.put(c, right);\n            maxLen = Math.max(maxLen, right - left + 1);\n        }\n        return maxLen;\n    }\n}',
      go: 'func lengthOfLongestSubstring(s string) int {\n    m := make(map[byte]int)\n    left, maxLen := 0, 0\n    for right := 0; right < len(s); right++ {\n        c := s[right]\n        if idx, ok := m[c]; ok && idx >= left {\n            left = idx + 1\n        }\n        m[c] = right\n        if right-left+1 > maxLen {\n            maxLen = right - left + 1\n        }\n    }\n    return maxLen\n}',
      cpp: 'class Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        unordered_map<char, int> map;\n        int left = 0, maxLen = 0;\n        for (int right = 0; right < s.size(); right++) {\n            char c = s[right];\n            if (map.count(c) && map[c] >= left) {\n                left = map[c] + 1;\n            }\n            map[c] = right;\n            maxLen = max(maxLen, right - left + 1);\n        }\n        return maxLen;\n    }\n};',
      rust: 'impl Solution {\n    pub fn length_of_longest_substring(s: String) -> i32 {\n        use std::collections::HashMap;\n        let mut map = HashMap::new();\n        let mut left = 0;\n        let mut max_len = 0;\n        for (right, c) in s.chars().enumerate() {\n            if let Some(&idx) = map.get(&c) {\n                if idx >= left {\n                    left = idx + 1;\n                }\n            }\n            map.insert(c, right);\n            max_len = max_len.max(right - left + 1);\n        }\n        max_len as i32\n    }\n}',
    },
    testCases: [
      { input: 'abcabcbb', output: '3', isHidden: false, points: 1, description: 'Example 1' },
      { input: 'bbbbb', output: '1', isHidden: false, points: 1, description: 'All same' },
      { input: 'pwwkew', output: '3', isHidden: false, points: 1, description: 'Example 2' },
      { input: '', output: '0', isHidden: true, points: 1, description: 'Empty string' },
      { input: 'abcdef', output: '6', isHidden: true, points: 1, description: 'All unique' },
    ],
    constraints: '0 <= s.length <= 5 * 10^4\ns consists of English letters, digits, symbols and spaces.',
    timeLimit: 5000,
    memoryLimit: 256,
    explanation: 'Sliding window with hash map tracking last seen index of each character. When duplicate found, move left pointer past it. O(n) time, O(min(m,n)) space.',
    isPublished: true,
    isActive: true,
  },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing
    await CodingQuestion.deleteMany({});
    console.log('Cleared existing questions');

    // Insert new
    const inserted = await CodingQuestion.insertMany(questions);
    console.log(`Inserted ${inserted.length} coding questions`);

    for (const q of inserted) {
      console.log(`  - ${q.title} (${q.difficulty}) [${q.category}]`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();