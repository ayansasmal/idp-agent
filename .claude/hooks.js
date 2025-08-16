// Claude prompt hook: Appends extra instruction if prompt ends with -d
module.exports = function appendResearchInstruction(prompt) {
  if (typeof prompt === 'string' && prompt.trim().endsWith('-d')) {
    return prompt + '\n\nthink harder and research more';
  }
  return prompt;
};
