import type { UnitContent } from "../src/ai/schemas.js";

/**
 * A small sample course with hand-written game content. It shows the quality
 * bar the Claude prompt aims for, and lets the app be tried without an API key.
 * The text is original, written for this project.
 */

export const HABITS_TITLE = "How Habits Work";

export const HABITS_TEXT = `# The Habit Loop

Most of what we do each day is not decided in the moment. Researchers estimate that roughly 40 percent of our daily actions are habits rather than conscious choices. A habit is a behaviour that has become automatic because it was repeated in the same context until the brain stopped treating it as a decision.

Every habit runs on the same four-step loop. First comes a cue: a trigger such as a time of day, a place, an emotion, other people, or the action you just finished. The cue sparks a craving, which is the desire for the change in state the habit delivers. The craving drives a response, which is the behaviour itself. Finally the response produces a reward, the satisfying result that tells the brain the loop was worth running.

The reward is what makes the loop stick. Each time a cue is followed by a response and then a reward, the link between them gets stronger. Over time the brain starts to anticipate the reward as soon as it notices the cue, so the craving arrives before you have consciously decided anything. That is why habits feel effortless and also why bad habits are so hard to stop.

A common belief is that habits are formed by willpower. In reality, people who seem to have great self-control mostly structure their lives so they face fewer temptations in the first place. Willpower is unreliable when we are tired or stressed, while a well-designed environment works every day.

# Building and Breaking Habits

Because every habit follows the same loop, you can design habits by working on each step. To build a good habit, make the cue obvious, make the craving attractive, make the response easy, and make the reward satisfying. To break a bad habit, invert each rule: make the cue invisible, make it unattractive, make it difficult, and make it unsatisfying.

Two techniques make cues more reliable. An implementation intention is a specific plan in the form "I will do this behaviour at this time in this place," which removes the vague question of when to act. Habit stacking links a new habit to one you already have: "After I pour my morning coffee, I will write one line in my journal." The existing habit becomes the cue for the new one.

Environment often matters more than motivation. If you want to eat more fruit, put it in a bowl on the counter instead of hiding it in a drawer. If you want to use your phone less, charge it in another room. Reducing friction for good habits and adding friction for bad ones changes behaviour without a daily battle.

Finally, start small. A new habit should take less than two minutes at first: "read one page" rather than "read for an hour." The goal of the first weeks is to become the kind of person who shows up every day. Once the behaviour is automatic, it is easy to increase the amount.`;

export const HABITS_UNITS: UnitContent[] = [
  {
    unit_title: "Inside the Habit Loop",
    hook: "Almost half of what you did today, you didn't actually decide to do.",
    knowledge: [
      {
        key: "k1",
        type: "fact",
        title: "Habits run your day",
        explanation: "Roughly 40% of daily actions are habits, not conscious decisions.",
        source_quote: "roughly 40 percent of our daily actions are habits rather than conscious choices",
      },
      {
        key: "k2",
        type: "process",
        title: "The four-step habit loop",
        explanation: "Every habit runs cue, then craving, then response, then reward.",
        source_quote: "Every habit runs on the same four-step loop.",
      },
      {
        key: "k3",
        type: "concept",
        title: "Cues trigger habits",
        explanation: "A cue is the trigger: a time, place, emotion, other people, or a preceding action.",
        source_quote: "a trigger such as a time of day, a place, an emotion, other people, or the action you just finished",
      },
      {
        key: "k4",
        type: "cause_effect",
        title: "Rewards wire the loop in",
        explanation: "Each reward strengthens the cue-response link until the craving fires automatically on the cue.",
        source_quote: "Each time a cue is followed by a response and then a reward, the link between them gets stronger.",
      },
      {
        key: "k5",
        type: "misconception",
        title: "Environment beats willpower",
        explanation: "Self-controlled people mostly avoid temptation by design; willpower fails when tired or stressed.",
        source_quote: "people who seem to have great self-control mostly structure their lives so they face fewer temptations",
      },
    ],
    challenges: [
      {
        mechanic: "swipe",
        title: "Habit Myth Busters",
        prompt: "Swipe right for true, left for false.",
        cards: [
          { text: "Around 40% of what you do each day is habit.", is_true: true, why: "Researchers estimate roughly 40% of daily actions are habits." },
          { text: "Habits are mainly built with strong willpower.", is_true: false, why: "People with 'self-control' mostly design their lives to face fewer temptations." },
          { text: "An emotion like boredom can be a habit cue.", is_true: true, why: "Cues include times, places, emotions, other people, and preceding actions." },
          { text: "The reward is the least important step of the loop.", is_true: false, why: "The reward is what makes the loop stick." },
        ],
        knowledge_keys: ["k1", "k3", "k4", "k5"],
        difficulty: "easy",
        explanation: "Habits are automatic, triggered by cues, and locked in by rewards, not willpower.",
      },
      {
        mechanic: "sequence",
        title: "Build the Habit Machine",
        prompt: "Snap the four parts of the habit loop together in the order they fire.",
        steps: ["Cue: something triggers you", "Craving: you want a change", "Response: you do the behaviour", "Reward: you get the payoff"],
        knowledge_keys: ["k2"],
        difficulty: "easy",
        explanation: "Cue sparks craving, craving drives the response, the response delivers the reward.",
      },
      {
        mechanic: "sort",
        title: "Label the Loop",
        prompt: "Sam checks their phone every time they feel bored. Sort each moment into its step.",
        buckets: ["Cue", "Response", "Reward"],
        items: [
          { text: "Feeling bored in a queue", bucket: "Cue" },
          { text: "Unlocking the phone and scrolling", bucket: "Response" },
          { text: "A hit of novelty from a new post", bucket: "Reward" },
          { text: "Hearing a notification ping", bucket: "Cue" },
          { text: "Opening the message", bucket: "Response" },
          { text: "Relief from the boredom", bucket: "Reward" },
        ],
        knowledge_keys: ["k2", "k3"],
        difficulty: "medium",
        explanation: "Triggers are cues, the behaviour is the response, and the good feeling after is the reward.",
      },
      {
        mechanic: "chain",
        title: "Chain Reaction",
        prompt: "Why do habits end up feeling automatic? Fill in the missing link.",
        links: [
          "A cue is followed by a response and a reward",
          "The cue-response link gets stronger each time",
          "The brain anticipates the reward as soon as it sees the cue",
          "The craving fires before you consciously decide",
        ],
        missing_index: 1,
        distractors: ["You get tired of the reward and stop wanting it", "Your willpower grows stronger each time"],
        knowledge_keys: ["k4"],
        difficulty: "medium",
        explanation: "Repeated rewards strengthen the link until the brain predicts the reward from the cue alone.",
      },
      {
        mechanic: "estimate",
        title: "Autopilot Meter",
        question: "What share of your daily actions are habits rather than conscious choices?",
        answer: 40,
        min: 0,
        max: 100,
        unit: "%",
        tolerance: 8,
        knowledge_keys: ["k1"],
        difficulty: "medium",
        explanation: "Researchers estimate roughly 40%. Nearly half your day runs on autopilot.",
      },
      {
        mechanic: "spot_error",
        title: "Catch the Coach",
        speaker: "Coach Rex",
        statements: [
          "Every habit starts with a cue that triggers it.",
          "The reward is what teaches your brain the loop is worth repeating.",
          "The people who stick to habits simply have more willpower than everyone else.",
          "Over time, the craving can kick in before you even decide anything.",
        ],
        wrong_index: 2,
        correction: "People who stick to habits mostly design their environment so they face fewer temptations.",
        knowledge_keys: ["k5"],
        difficulty: "medium",
        explanation: "Willpower is unreliable when tired or stressed; environment design works every day.",
      },
      {
        mechanic: "scenario",
        title: "The Late-Night Snacker",
        character: "You are helping your roommate Jo.",
        situation:
          "Jo raids the snack cupboard every night while watching TV and says they 'just need more discipline'. They've tried to resist for weeks and keep failing, especially after long days.",
        question: "What's your best advice?",
        options: [
          {
            text: "Move the snacks out of the living room and keep fruit by the couch.",
            correct: true,
            consequence: "Without the cue in sight, Jo barely thinks about snacks. By week two the urge has faded.",
          },
          {
            text: "Try harder: set a rule and push through the cravings.",
            correct: false,
            consequence: "It works for two days. Then a stressful Thursday hits and the cupboard wins again.",
          },
          {
            text: "Stop watching TV forever.",
            correct: false,
            consequence: "Jo lasts one evening. Removing something they enjoy without a replacement just backfires.",
          },
        ],
        knowledge_keys: ["k5", "k3"],
        difficulty: "hard",
        explanation: "Willpower breaks down when tired; changing the environment removes the cue itself.",
      },
      {
        mechanic: "teach_back",
        title: "Teach Pip the Loop",
        npc_name: "Pip",
        npc_question: "Wait, why can't I just stop biting my nails when I want to? How do habits even work?",
        key_points: [
          "Habits run on a loop: cue, craving, response, reward",
          "The reward strengthens the link each time, so it becomes automatic",
          "Changing the cue or environment works better than willpower alone",
        ],
        knowledge_keys: ["k2", "k4", "k5"],
        difficulty: "hard",
        explanation: "A great explanation covers the loop, why rewards make it automatic, and why environment beats willpower.",
      },
    ],
  },
  {
    unit_title: "Hack Your Habits",
    hook: "The same four levers that build good habits can dismantle bad ones.",
    knowledge: [
      {
        key: "k1",
        type: "framework",
        title: "Four laws, and their inverse",
        explanation: "Build: obvious, attractive, easy, satisfying. Break: invisible, unattractive, difficult, unsatisfying.",
        source_quote: "make the cue obvious, make the craving attractive, make the response easy, and make the reward satisfying",
      },
      {
        key: "k2",
        type: "concept",
        title: "Implementation intention",
        explanation: "A plan that names the behaviour, time and place, so you never have to decide when.",
        source_quote: "\"I will do this behaviour at this time in this place,\"",
      },
      {
        key: "k3",
        type: "concept",
        title: "Habit stacking",
        explanation: "Attach a new habit to an existing one, which then acts as the cue.",
        source_quote: "Habit stacking links a new habit to one you already have",
      },
      {
        key: "k4",
        type: "claim",
        title: "Design your environment",
        explanation: "Less friction for good habits and more for bad ones beats relying on motivation.",
        source_quote: "Environment often matters more than motivation.",
      },
      {
        key: "k5",
        type: "framework",
        title: "The two-minute start",
        explanation: "Start with a version that takes under two minutes; show up first, scale later.",
        source_quote: "A new habit should take less than two minutes at first",
      },
    ],
    challenges: [
      {
        mechanic: "match",
        title: "Connect the Tools",
        prompt: "Link each technique to an example of it.",
        pairs: [
          { left: "Implementation intention", right: "\"I'll run at 7am in the park on Mondays.\"" },
          { left: "Habit stacking", right: "\"After I brush my teeth, I'll floss one tooth.\"" },
          { left: "Environment design", right: "Charging your phone in the kitchen overnight" },
          { left: "Two-minute start", right: "\"Put on running shoes\" instead of \"run 5k\"" },
        ],
        knowledge_keys: ["k2", "k3", "k4", "k5"],
        difficulty: "easy",
        explanation: "Each tool targets a different weak spot: when, what triggers it, friction, and size.",
      },
      {
        mechanic: "sort",
        title: "Build or Break?",
        prompt: "Is each move helping to build a habit or to break one?",
        buckets: ["Building a habit", "Breaking a habit"],
        items: [
          { text: "Leave your guitar on a stand in the living room", bucket: "Building a habit" },
          { text: "Log out of social media after every use", bucket: "Breaking a habit" },
          { text: "Pair your workout with your favourite podcast", bucket: "Building a habit" },
          { text: "Keep sweets in a high, hard-to-reach cupboard", bucket: "Breaking a habit" },
          { text: "Tick a box on a calendar after studying", bucket: "Building a habit" },
          { text: "Unfollow accounts that trigger impulse shopping", bucket: "Breaking a habit" },
        ],
        knowledge_keys: ["k1", "k4"],
        difficulty: "easy",
        explanation: "Building makes things obvious, attractive, easy and satisfying; breaking does the opposite.",
      },
      {
        mechanic: "sequence",
        title: "Assemble the Build Kit",
        prompt: "Order the four 'build' laws to match the loop step each one targets.",
        steps: ["Make it obvious (cue)", "Make it attractive (craving)", "Make it easy (response)", "Make it satisfying (reward)"],
        knowledge_keys: ["k1"],
        difficulty: "medium",
        explanation: "Each law targets one step of the loop, in the same order: cue, craving, response, reward.",
      },
      {
        mechanic: "scenario",
        title: "The Gym Membership",
        character: "You are Priya, who just paid for a gym membership.",
        situation: "It's January. You've told yourself 'I'll go to the gym more this year', but two weeks in, you haven't gone once.",
        question: "Which plan gives you the best shot?",
        options: [
          {
            text: "\"On Mon/Wed/Fri at 6pm I'll go straight from work to the gym, and just do 10 minutes.\"",
            correct: true,
            consequence: "You never have to decide when. The tiny goal gets you in the door, and most days you stay longer.",
          },
          {
            text: "\"I'll go whenever I feel motivated, for at least 90 minutes.\"",
            correct: false,
            consequence: "Motivation rarely shows up after work, and 90 minutes feels huge. The card gathers dust.",
          },
          {
            text: "\"I'll watch fitness videos until I feel inspired enough to start.\"",
            correct: false,
            consequence: "You feel inspired, but inspiration isn't a plan. Nothing changes.",
          },
        ],
        knowledge_keys: ["k2", "k5"],
        difficulty: "medium",
        explanation: "A specific time and place plus a tiny starting version beats waiting for motivation.",
      },
      {
        mechanic: "chain",
        title: "Stack Attack",
        prompt: "Complete the habit stack so the new habit has a reliable cue.",
        links: ["You pour your morning coffee (existing habit)", "Pouring coffee becomes the cue", "You write one line in your journal", "The journal habit runs on autopilot"],
        missing_index: 1,
        distractors: ["You wait until you feel like journaling", "You set a goal to journal 30 minutes"],
        knowledge_keys: ["k3"],
        difficulty: "medium",
        explanation: "In habit stacking, the existing habit becomes the cue that triggers the new one.",
      },
      {
        mechanic: "spot_error",
        title: "Detective: Bad Advice",
        speaker: "Influencer Kai",
        statements: [
          "Put healthy snacks where you can see them.",
          "Charge your phone in another room to scroll less.",
          "Start new habits big: an hour a day, so you see results fast.",
          "Tie new habits to things you already do every day.",
        ],
        wrong_index: 2,
        correction: "Start tiny: a new habit should take less than two minutes at first.",
        knowledge_keys: ["k5", "k4", "k3"],
        difficulty: "medium",
        explanation: "The goal of the first weeks is showing up every day; you scale up once it's automatic.",
      },
      {
        mechanic: "teach_back",
        title: "Help Pip Start Reading",
        npc_name: "Pip",
        npc_question: "I want to read more books but I never actually do it. What would you tell me to try?",
        key_points: [
          "Make it obvious and easy, e.g. keep a book visible and reduce friction",
          "Use a specific plan or stack it on an existing habit",
          "Start tiny (under two minutes, like one page) and grow later",
        ],
        knowledge_keys: ["k1", "k2", "k3", "k5"],
        difficulty: "hard",
        explanation: "The best advice combines a clear cue, low friction, and a tiny starting version.",
      },
    ],
  },
];
