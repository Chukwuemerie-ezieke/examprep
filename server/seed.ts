import { db } from "./storage";
import { examBodies, subjects, topics, questions, studyTips } from "@shared/schema";

export function seedDatabase() {
  // Check if already seeded
  const existingBodies = db.select().from(examBodies).all();
  if (existingBodies.length > 0) return;

  // Exam bodies
  const waec = db.insert(examBodies).values({ name: "WAEC", fullName: "West African Examinations Council", description: "Senior School Certificate Examination (SSCE/WASSCE)" }).returning().get();
  const neco = db.insert(examBodies).values({ name: "NECO", fullName: "National Examinations Council", description: "Senior School Certificate Examination" }).returning().get();
  const jamb = db.insert(examBodies).values({ name: "JAMB", fullName: "Joint Admissions and Matriculation Board", description: "Unified Tertiary Matriculation Examination (UTME)" }).returning().get();

  // Subjects
  const maths = db.insert(subjects).values({ name: "Mathematics", icon: "calculator" }).returning().get();
  const english = db.insert(subjects).values({ name: "English Language", icon: "book-open" }).returning().get();
  const physics = db.insert(subjects).values({ name: "Physics", icon: "atom" }).returning().get();
  const chemistry = db.insert(subjects).values({ name: "Chemistry", icon: "flask-conical" }).returning().get();

  // Topics for Mathematics
  const mathTopics = [
    "Number and Numeration", "Algebra", "Geometry and Mensuration",
    "Trigonometry", "Statistics and Probability", "Calculus", "Sets and Logic"
  ].map(name => db.insert(topics).values({ subjectId: maths.id, name }).returning().get());

  // Topics for English
  const engTopics = [
    "Comprehension", "Lexis and Structure", "Oral English",
    "Essay Writing", "Summary Writing", "Literary Appreciation"
  ].map(name => db.insert(topics).values({ subjectId: english.id, name }).returning().get());

  // Topics for Physics
  const phyTopics = [
    "Mechanics", "Waves and Sound", "Heat and Thermodynamics",
    "Electricity and Magnetism", "Optics", "Modern Physics", "Nuclear Physics"
  ].map(name => db.insert(topics).values({ subjectId: physics.id, name }).returning().get());

  // Topics for Chemistry
  const chemTopics = [
    "Atomic Structure", "Chemical Bonding", "Stoichiometry",
    "States of Matter", "Acids, Bases and Salts", "Organic Chemistry",
    "Electrochemistry", "Periodic Table"
  ].map(name => db.insert(topics).values({ subjectId: chemistry.id, name }).returning().get());

  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const bodies = [waec, neco, jamb];
  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];

  // ==================== MATHEMATICS QUESTIONS ====================
  const mathQuestions = [
    // Number and Numeration
    { topic: 0, text: "Simplify: 3⅔ + 1¼ - 2⅚", a: "2 1/12", b: "2 1/6", c: "1 11/12", d: "3 1/12", correct: "A", explanation: "Convert to improper fractions: 11/3 + 5/4 - 17/6. LCM of 3, 4, 6 is 12. = 44/12 + 15/12 - 34/12 = 25/12 = 2 1/12", diff: "easy", ref: "New General Mathematics for SS1, Chapter 1" },
    { topic: 0, text: "Express 0.000425 in standard form", a: "4.25 × 10⁻⁴", b: "4.25 × 10⁻³", c: "42.5 × 10⁻⁵", d: "0.425 × 10⁻³", correct: "A", explanation: "Move the decimal point 4 places to the right to get 4.25, then multiply by 10⁻⁴. Standard form: 4.25 × 10⁻⁴", diff: "easy", ref: "New General Mathematics for SS1, Chapter 2" },
    { topic: 0, text: "If log₁₀ 2 = 0.3010, find log₁₀ 8", a: "0.9030", b: "0.6020", c: "2.4080", d: "0.3010", correct: "A", explanation: "log₁₀ 8 = log₁₀ 2³ = 3 × log₁₀ 2 = 3 × 0.3010 = 0.9030", diff: "medium", ref: "New General Mathematics for SS2, Chapter 1" },
    { topic: 0, text: "Convert 110101₂ to base 10", a: "53", b: "45", c: "51", d: "49", correct: "A", explanation: "1×2⁵ + 1×2⁴ + 0×2³ + 1×2² + 0×2¹ + 1×2⁰ = 32 + 16 + 0 + 4 + 0 + 1 = 53", diff: "medium", ref: "New General Mathematics for SS1, Chapter 3" },
    { topic: 0, text: "Find the LCM of 12, 18 and 24", a: "72", b: "48", c: "36", d: "144", correct: "A", explanation: "12 = 2² × 3; 18 = 2 × 3²; 24 = 2³ × 3. LCM = 2³ × 3² = 8 × 9 = 72", diff: "easy", ref: "New General Mathematics for SS1, Chapter 1" },
    { topic: 0, text: "Evaluate (0.25)² × 16", a: "1", b: "4", c: "0.5", d: "2", correct: "A", explanation: "(0.25)² = 0.0625. 0.0625 × 16 = 1. Alternatively, (1/4)² × 16 = 1/16 × 16 = 1", diff: "easy", ref: "New General Mathematics for SS1, Chapter 2" },

    // Algebra
    { topic: 1, text: "Solve for x: 3x + 7 = 22", a: "5", b: "7", c: "4", d: "6", correct: "A", explanation: "3x + 7 = 22. Subtract 7 from both sides: 3x = 15. Divide by 3: x = 5", diff: "easy", ref: "New General Mathematics for SS1, Chapter 5" },
    { topic: 1, text: "If 2ˣ = 32, find x", a: "5", b: "4", c: "6", d: "3", correct: "A", explanation: "2ˣ = 32. Since 2⁵ = 32, x = 5", diff: "easy", ref: "New General Mathematics for SS2, Chapter 3" },
    { topic: 1, text: "Factorize completely: x² - 5x + 6", a: "(x - 2)(x - 3)", b: "(x + 2)(x + 3)", c: "(x - 1)(x - 6)", d: "(x + 1)(x - 6)", correct: "A", explanation: "Find two numbers that multiply to give 6 and add to give -5: -2 and -3. So x² - 5x + 6 = (x - 2)(x - 3)", diff: "medium", ref: "New General Mathematics for SS2, Chapter 4" },
    { topic: 1, text: "Solve the simultaneous equations: 2x + y = 7, x - y = 2", a: "x = 3, y = 1", b: "x = 2, y = 3", c: "x = 4, y = -1", d: "x = 1, y = 5", correct: "A", explanation: "Adding both equations: 3x = 9, so x = 3. Substituting: 2(3) + y = 7, y = 1", diff: "medium", ref: "New General Mathematics for SS2, Chapter 5" },
    { topic: 1, text: "Find the value of p if 4p² - 12p + 9 = 0", a: "3/2", b: "2/3", c: "3", d: "-3/2", correct: "A", explanation: "4p² - 12p + 9 = (2p - 3)² = 0. Therefore 2p - 3 = 0, p = 3/2", diff: "medium", ref: "New General Mathematics for SS3, Chapter 2" },
    { topic: 1, text: "Make r the subject of the formula: V = πr²h", a: "r = √(V/πh)", b: "r = V/πh", c: "r = √(Vπh)", d: "r = V²/πh", correct: "A", explanation: "V = πr²h → r² = V/(πh) → r = √(V/πh)", diff: "medium", ref: "New General Mathematics for SS2, Chapter 6" },

    // Geometry and Mensuration
    { topic: 2, text: "Calculate the area of a circle with radius 7 cm (take π = 22/7)", a: "154 cm²", b: "44 cm²", c: "308 cm²", d: "77 cm²", correct: "A", explanation: "Area = πr² = (22/7) × 7² = (22/7) × 49 = 22 × 7 = 154 cm²", diff: "easy", ref: "New General Mathematics for SS1, Chapter 8" },
    { topic: 2, text: "Find the volume of a cylinder with radius 3 cm and height 10 cm (π = 3.14)", a: "282.6 cm³", b: "94.2 cm³", c: "188.4 cm³", d: "314 cm³", correct: "A", explanation: "V = πr²h = 3.14 × 3² × 10 = 3.14 × 9 × 10 = 282.6 cm³", diff: "easy", ref: "New General Mathematics for SS2, Chapter 9" },
    { topic: 2, text: "The angles of a triangle are (2x + 10)°, (3x - 20)°, and (x + 40)°. Find x", a: "25", b: "30", c: "20", d: "35", correct: "A", explanation: "Sum of angles in a triangle = 180°. (2x + 10) + (3x - 20) + (x + 40) = 180. 6x + 30 = 180. 6x = 150. x = 25", diff: "medium", ref: "New General Mathematics for SS1, Chapter 9" },
    { topic: 2, text: "Calculate the total surface area of a cone with base radius 5 cm and slant height 13 cm (π = 3.14)", a: "282.6 cm²", b: "204.1 cm²", c: "314 cm²", d: "188.4 cm²", correct: "A", explanation: "Total surface area = πr(r + l) = 3.14 × 5 × (5 + 13) = 3.14 × 5 × 18 = 282.6 cm²", diff: "hard", ref: "New General Mathematics for SS3, Chapter 5" },

    // Trigonometry
    { topic: 3, text: "If sin θ = 3/5, find cos θ", a: "4/5", b: "3/4", c: "5/3", d: "5/4", correct: "A", explanation: "Using sin²θ + cos²θ = 1: (3/5)² + cos²θ = 1. cos²θ = 1 - 9/25 = 16/25. cosθ = 4/5", diff: "medium", ref: "New General Mathematics for SS3, Chapter 7" },
    { topic: 3, text: "Find the value of tan 45°", a: "1", b: "0", c: "√2", d: "1/√2", correct: "A", explanation: "tan 45° = sin 45° / cos 45° = (1/√2) / (1/√2) = 1. This is a standard trigonometric value.", diff: "easy", ref: "New General Mathematics for SS2, Chapter 11" },
    { topic: 3, text: "A ladder 10 m long leans against a wall making an angle of 60° with the ground. How high up the wall does the ladder reach?", a: "8.66 m", b: "5 m", c: "7.07 m", d: "10 m", correct: "A", explanation: "Using sin: height = 10 × sin 60° = 10 × (√3/2) = 10 × 0.866 = 8.66 m", diff: "medium", ref: "New General Mathematics for SS3, Chapter 7" },

    // Statistics and Probability
    { topic: 4, text: "Find the mean of: 5, 8, 12, 7, 3, 10, 6, 9", a: "7.5", b: "8", c: "7", d: "8.5", correct: "A", explanation: "Mean = (5+8+12+7+3+10+6+9)/8 = 60/8 = 7.5", diff: "easy", ref: "New General Mathematics for SS2, Chapter 14" },
    { topic: 4, text: "A bag contains 4 red balls, 3 blue balls, and 5 green balls. What is the probability of picking a blue ball?", a: "1/4", b: "1/3", c: "3/7", d: "5/12", correct: "A", explanation: "Total balls = 4 + 3 + 5 = 12. P(blue) = 3/12 = 1/4", diff: "easy", ref: "New General Mathematics for SS3, Chapter 12" },
    { topic: 4, text: "The median of the numbers 3, 7, 1, 8, 2, 9, 4 is:", a: "4", b: "5", c: "7", d: "3", correct: "A", explanation: "Arrange in order: 1, 2, 3, 4, 7, 8, 9. The middle value (4th) is 4.", diff: "easy", ref: "New General Mathematics for SS2, Chapter 14" },

    // Calculus
    { topic: 5, text: "Differentiate y = 3x⁴ - 2x² + 5x - 1", a: "12x³ - 4x + 5", b: "12x³ - 4x + 5x", c: "3x³ - 2x + 5", d: "12x⁴ - 4x² + 5", correct: "A", explanation: "dy/dx = 4×3x³ - 2×2x + 5 = 12x³ - 4x + 5. Apply the power rule: d/dx(xⁿ) = nxⁿ⁻¹", diff: "medium", ref: "New General Mathematics for SS3, Chapter 15" },
    { topic: 5, text: "Evaluate ∫(2x + 3)dx", a: "x² + 3x + C", b: "2x² + 3x + C", c: "x² + 3 + C", d: "2x + C", correct: "A", explanation: "∫(2x + 3)dx = 2(x²/2) + 3x + C = x² + 3x + C", diff: "medium", ref: "New General Mathematics for SS3, Chapter 16" },

    // Sets and Logic
    { topic: 6, text: "In a class of 40 students, 25 study French, 20 study German, and 10 study both. How many study neither?", a: "5", b: "10", c: "15", d: "0", correct: "A", explanation: "Using n(F∪G) = n(F) + n(G) - n(F∩G) = 25 + 20 - 10 = 35. Neither = 40 - 35 = 5", diff: "medium", ref: "New General Mathematics for SS1, Chapter 4" },
    { topic: 6, text: "If P = {a, b, c, d} and Q = {b, d, e, f}, find P ∩ Q", a: "{b, d}", b: "{a, c}", c: "{a, b, c, d, e, f}", d: "{e, f}", correct: "A", explanation: "P ∩ Q (intersection) is the set of elements common to both P and Q: {b, d}", diff: "easy", ref: "New General Mathematics for SS1, Chapter 4" },
  ];

  // ==================== ENGLISH LANGUAGE QUESTIONS ====================
  const engQuestions = [
    // Comprehension
    { topic: 0, text: "Choose the word that is nearest in meaning to the underlined word: The man was AFFLUENT and lived in a mansion.", a: "Wealthy", b: "Intelligent", c: "Arrogant", d: "Generous", correct: "A", explanation: "Affluent means having a great deal of money or wealth. The context of living in a mansion confirms this meaning.", diff: "easy", ref: "Exam Focus English, Chapter 3" },
    { topic: 0, text: "Choose the word that is opposite in meaning to: TEMPORARY", a: "Permanent", b: "Momentary", c: "Brief", d: "Fleeting", correct: "A", explanation: "Temporary means lasting for a limited time. Its opposite is permanent, meaning lasting indefinitely.", diff: "easy", ref: "Exam Focus English, Chapter 3" },
    { topic: 0, text: "The phrase 'a bolt from the blue' means:", a: "An unexpected event", b: "A flash of lightning", c: "A blue-colored bolt", d: "A type of fabric", correct: "A", explanation: "'A bolt from the blue' is an idiom meaning something completely unexpected, like a bolt of lightning from a clear blue sky.", diff: "medium", ref: "Exam Focus English, Chapter 7" },

    // Lexis and Structure
    { topic: 1, text: "Choose the correct option: Neither the students nor the teacher ____ present.", a: "was", b: "were", c: "are", d: "have been", correct: "A", explanation: "With 'neither...nor', the verb agrees with the subject closest to it. 'Teacher' is singular, so 'was' is correct.", diff: "medium", ref: "English Grammar by P.O. Olatunbosun, Chapter 8" },
    { topic: 1, text: "Select the option with the correct spelling:", a: "Accommodation", b: "Accomodation", c: "Accomodaton", d: "Acomodation", correct: "A", explanation: "Accommodation is spelled with double 'c' and double 'm'. This is one of the most commonly misspelled words.", diff: "easy", ref: "Exam Focus English, Chapter 5" },
    { topic: 1, text: "Choose the option that best completes the sentence: The boy, together with his friends, ____ going to the market.", a: "is", b: "are", c: "were", d: "have been", correct: "A", explanation: "When 'together with' separates the subject from the verb, the verb agrees with the first subject 'boy' (singular), so 'is' is correct.", diff: "medium", ref: "English Grammar by P.O. Olatunbosun, Chapter 8" },
    { topic: 1, text: "Identify the figure of speech: 'The wind howled through the night.'", a: "Personification", b: "Simile", c: "Metaphor", d: "Hyperbole", correct: "A", explanation: "Personification gives human qualities to non-human things. 'Howled' is a human/animal action attributed to the wind.", diff: "medium", ref: "Exam Focus English, Chapter 9" },
    { topic: 1, text: "The passive form of 'The dog bit the man' is:", a: "The man was bitten by the dog", b: "The man is bitten by the dog", c: "The man has been bitten by the dog", d: "The man had been bitten by the dog", correct: "A", explanation: "To convert to passive: object becomes subject, verb becomes 'was/were + past participle', subject becomes agent with 'by'.", diff: "medium", ref: "English Grammar by P.O. Olatunbosun, Chapter 10" },

    // Oral English
    { topic: 2, text: "In which of the following does the underlined letters have a different sound from the others? rouGH, touGH, enouGH, thouGH", a: "thouGH", b: "rouGH", c: "touGH", d: "enouGH", correct: "A", explanation: "In 'rough', 'tough', and 'enough', the 'gh' is pronounced as /f/. In 'though', the 'gh' is silent.", diff: "medium", ref: "Oral English for Schools and Colleges, Chapter 2" },
    { topic: 2, text: "The word 'record' when used as a noun is stressed on the:", a: "First syllable", b: "Second syllable", c: "Third syllable", d: "Both syllables equally", correct: "A", explanation: "In English, two-syllable words that can be both nouns and verbs typically stress the first syllable as nouns (REcord) and the second as verbs (reCORD).", diff: "medium", ref: "Oral English for Schools and Colleges, Chapter 4" },
    { topic: 2, text: "How many syllables are in the word 'examination'?", a: "5", b: "4", c: "6", d: "3", correct: "A", explanation: "ex-am-i-na-tion = 5 syllables. Each vowel sound creates a syllable.", diff: "easy", ref: "Oral English for Schools and Colleges, Chapter 1" },

    // Essay Writing
    { topic: 3, text: "Which of the following is NOT a type of essay?", a: "Diagrammatic essay", b: "Narrative essay", c: "Argumentative essay", d: "Descriptive essay", correct: "A", explanation: "The main types of essays are narrative, descriptive, argumentative/persuasive, and expository. 'Diagrammatic essay' is not a recognized essay type.", diff: "easy", ref: "Exam Focus English, Chapter 12" },
    { topic: 3, text: "A formal letter should begin with:", a: "The writer's address", b: "Dear Sir/Madam", c: "The date only", d: "The recipient's name", correct: "A", explanation: "A formal letter starts with the writer's address at the top right corner, followed by the date, then the recipient's address on the left.", diff: "easy", ref: "Exam Focus English, Chapter 11" },

    // Summary
    { topic: 4, text: "The main purpose of a summary is to:", a: "Present the main ideas briefly", b: "Add new information", c: "Give your personal opinion", d: "Rewrite the passage word for word", correct: "A", explanation: "A summary presents the essential points of a passage in a condensed form, using your own words while retaining the original meaning.", diff: "easy", ref: "Exam Focus English, Chapter 13" },
  ];

  // ==================== PHYSICS QUESTIONS ====================
  const phyQuestions = [
    // Mechanics
    { topic: 0, text: "A car accelerates uniformly from rest to 20 m/s in 4 seconds. What is the acceleration?", a: "5 m/s²", b: "80 m/s²", c: "4 m/s²", d: "10 m/s²", correct: "A", explanation: "Acceleration = (final velocity - initial velocity) / time = (20 - 0) / 4 = 5 m/s²", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 3" },
    { topic: 0, text: "A body of mass 5 kg is acted upon by a force of 20 N. Calculate its acceleration.", a: "4 m/s²", b: "100 m/s²", c: "25 m/s²", d: "0.25 m/s²", correct: "A", explanation: "Using Newton's second law: F = ma, a = F/m = 20/5 = 4 m/s²", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 4" },
    { topic: 0, text: "Calculate the kinetic energy of a 2 kg object moving at 10 m/s", a: "100 J", b: "20 J", c: "200 J", d: "50 J", correct: "A", explanation: "KE = ½mv² = ½ × 2 × 10² = ½ × 2 × 100 = 100 J", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 5" },
    { topic: 0, text: "A ball is thrown vertically upward with a velocity of 30 m/s. Find the maximum height reached (g = 10 m/s²)", a: "45 m", b: "90 m", c: "30 m", d: "60 m", correct: "A", explanation: "At maximum height, v = 0. Using v² = u² - 2gs: 0 = 900 - 20s, s = 45 m", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 3" },
    { topic: 0, text: "The SI unit of momentum is:", a: "kg m/s", b: "N/m", c: "J/s", d: "kg m/s²", correct: "A", explanation: "Momentum = mass × velocity. Units: kg × m/s = kg m/s (or equivalently, N·s)", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 4" },

    // Waves and Sound
    { topic: 1, text: "Calculate the speed of a wave with frequency 50 Hz and wavelength 2 m", a: "100 m/s", b: "25 m/s", c: "52 m/s", d: "48 m/s", correct: "A", explanation: "Wave speed = frequency × wavelength = 50 × 2 = 100 m/s", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 10" },
    { topic: 1, text: "Which of the following is NOT a property of sound waves?", a: "Polarization", b: "Reflection", c: "Refraction", d: "Diffraction", correct: "A", explanation: "Sound waves are longitudinal waves and cannot be polarized. Polarization only occurs in transverse waves.", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 11" },
    { topic: 1, text: "The frequency of a vibrating string is 200 Hz. If the velocity of the wave is 400 m/s, what is the wavelength?", a: "2 m", b: "0.5 m", c: "80000 m", d: "4 m", correct: "A", explanation: "v = fλ, so λ = v/f = 400/200 = 2 m", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 10" },

    // Heat and Thermodynamics
    { topic: 2, text: "Convert 100°C to Kelvin", a: "373 K", b: "273 K", c: "100 K", d: "212 K", correct: "A", explanation: "K = °C + 273 = 100 + 273 = 373 K", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 7" },
    { topic: 2, text: "Calculate the heat energy needed to raise the temperature of 2 kg of water by 50°C (specific heat capacity = 4200 J/kg°C)", a: "420,000 J", b: "210,000 J", c: "42,000 J", d: "840,000 J", correct: "A", explanation: "Q = mcΔT = 2 × 4200 × 50 = 420,000 J = 420 kJ", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 8" },

    // Electricity and Magnetism
    { topic: 3, text: "Three resistors of 2Ω, 3Ω, and 6Ω are connected in parallel. Find the effective resistance.", a: "1 Ω", b: "11 Ω", c: "0.5 Ω", d: "2 Ω", correct: "A", explanation: "1/R = 1/2 + 1/3 + 1/6 = 3/6 + 2/6 + 1/6 = 6/6 = 1. So R = 1 Ω", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 16" },
    { topic: 3, text: "A current of 2A flows through a resistor of 5Ω. Calculate the voltage across the resistor.", a: "10 V", b: "2.5 V", c: "7 V", d: "3 V", correct: "A", explanation: "Using Ohm's law: V = IR = 2 × 5 = 10 V", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 15" },
    { topic: 3, text: "Calculate the electrical energy consumed by a 100 W bulb in 5 hours", a: "500 Wh", b: "20 Wh", c: "50 Wh", d: "1000 Wh", correct: "A", explanation: "Energy = Power × Time = 100 W × 5 h = 500 Wh = 0.5 kWh", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 17" },

    // Optics
    { topic: 4, text: "The image formed by a plane mirror is:", a: "Virtual, erect and laterally inverted", b: "Real, inverted and magnified", c: "Virtual, inverted and diminished", d: "Real, erect and same size", correct: "A", explanation: "A plane mirror always produces a virtual (cannot be captured on screen), erect, same-size, and laterally inverted image.", diff: "easy", ref: "New School Physics by M.W. Anyakoha, Chapter 12" },
    { topic: 4, text: "A convex lens has a focal length of 20 cm. What is its power?", a: "5 D", b: "20 D", c: "0.5 D", d: "2 D", correct: "A", explanation: "Power = 1/f (in metres) = 1/0.20 = 5 D (dioptres)", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 13" },

    // Modern Physics
    { topic: 5, text: "The photoelectric effect demonstrates that light:", a: "Has particle nature", b: "Has wave nature only", c: "Is electromagnetic", d: "Travels in straight lines", correct: "A", explanation: "The photoelectric effect, where light ejects electrons from a metal surface, can only be explained by treating light as particles (photons), supporting its particle nature.", diff: "medium", ref: "New School Physics by M.W. Anyakoha, Chapter 22" },
  ];

  // ==================== CHEMISTRY QUESTIONS ====================
  const chemQuestions = [
    // Atomic Structure
    { topic: 0, text: "An element has atomic number 11 and mass number 23. How many neutrons does it have?", a: "12", b: "11", c: "23", d: "34", correct: "A", explanation: "Neutrons = Mass number - Atomic number = 23 - 11 = 12. The element is sodium (Na).", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 2" },
    { topic: 0, text: "The electronic configuration of an element with atomic number 17 is:", a: "2, 8, 7", b: "2, 8, 8", c: "2, 7, 8", d: "2, 8, 6, 1", correct: "A", explanation: "Atomic number 17 (Chlorine): electrons fill shells as 2, 8, 7. The first shell holds 2, the second 8, and the third 7.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 2" },
    { topic: 0, text: "Isotopes of an element have the same:", a: "Number of protons", b: "Number of neutrons", c: "Mass number", d: "Atomic mass", correct: "A", explanation: "Isotopes are atoms of the same element with the same number of protons (atomic number) but different numbers of neutrons (different mass numbers).", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 2" },

    // Chemical Bonding
    { topic: 1, text: "Which type of bond is formed between sodium and chlorine?", a: "Ionic bond", b: "Covalent bond", c: "Metallic bond", d: "Hydrogen bond", correct: "A", explanation: "Sodium (a metal) transfers an electron to chlorine (a non-metal), forming Na⁺ and Cl⁻ ions. The electrostatic attraction between these ions is an ionic bond.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 3" },
    { topic: 1, text: "A covalent bond is formed by:", a: "Sharing of electrons", b: "Transfer of electrons", c: "Sharing of protons", d: "Transfer of protons", correct: "A", explanation: "A covalent bond is formed when two non-metal atoms share one or more pairs of electrons to achieve stability.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 3" },
    { topic: 1, text: "Which of the following molecules has a double covalent bond?", a: "O₂", b: "H₂", c: "Cl₂", d: "N₂", correct: "A", explanation: "Oxygen (O₂) has a double covalent bond (O=O), sharing two pairs of electrons. H₂ and Cl₂ have single bonds, while N₂ has a triple bond.", diff: "medium", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 3" },

    // Stoichiometry
    { topic: 2, text: "What is the relative molecular mass of H₂SO₄? (H=1, S=32, O=16)", a: "98", b: "96", c: "49", d: "64", correct: "A", explanation: "RMM = (2×1) + 32 + (4×16) = 2 + 32 + 64 = 98", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 4" },
    { topic: 2, text: "How many moles of water are in 36 g? (H=1, O=16)", a: "2 moles", b: "1 mole", c: "18 moles", d: "0.5 moles", correct: "A", explanation: "Molar mass of H₂O = (2×1) + 16 = 18 g/mol. Number of moles = mass/molar mass = 36/18 = 2 moles", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 4" },
    { topic: 2, text: "In the reaction 2H₂ + O₂ → 2H₂O, what volume of oxygen is needed to completely react with 4 litres of hydrogen at STP?", a: "2 litres", b: "4 litres", c: "8 litres", d: "1 litre", correct: "A", explanation: "From the equation, 2 volumes of H₂ react with 1 volume of O₂. So 4 litres of H₂ needs 4/2 = 2 litres of O₂", diff: "medium", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 5" },

    // States of Matter
    { topic: 3, text: "Which gas law states that the volume of a gas is directly proportional to its temperature at constant pressure?", a: "Charles' Law", b: "Boyle's Law", c: "Dalton's Law", d: "Graham's Law", correct: "A", explanation: "Charles' Law states V/T = constant (at constant pressure), meaning volume is directly proportional to absolute temperature.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 6" },
    { topic: 3, text: "At STP, what is the molar volume of any gas?", a: "22.4 dm³", b: "22.4 cm³", c: "11.2 dm³", d: "44.8 dm³", correct: "A", explanation: "At Standard Temperature and Pressure (0°C, 1 atm), one mole of any gas occupies 22.4 dm³ (litres). This is Avogadro's law.", diff: "medium", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 6" },

    // Acids, Bases and Salts
    { topic: 4, text: "What is the pH of a neutral solution?", a: "7", b: "0", c: "14", d: "1", correct: "A", explanation: "A neutral solution has a pH of 7. Solutions with pH < 7 are acidic, and those with pH > 7 are basic/alkaline.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 9" },
    { topic: 4, text: "Which of the following is a strong acid?", a: "HCl", b: "CH₃COOH", c: "H₂CO₃", d: "HCN", correct: "A", explanation: "HCl (hydrochloric acid) is a strong acid because it completely dissociates in water. CH₃COOH, H₂CO₃, and HCN are weak acids.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 9" },
    { topic: 4, text: "The reaction between an acid and a base to produce salt and water is called:", a: "Neutralization", b: "Hydrolysis", c: "Combustion", d: "Decomposition", correct: "A", explanation: "Neutralization is the reaction between an acid and a base: Acid + Base → Salt + Water", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 9" },

    // Organic Chemistry
    { topic: 5, text: "What is the IUPAC name of CH₃CH₂OH?", a: "Ethanol", b: "Methanol", c: "Propanol", d: "Butanol", correct: "A", explanation: "CH₃CH₂OH has 2 carbon atoms (eth-) with a hydroxyl group (-ol), making it ethanol.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 16" },
    { topic: 5, text: "The general formula for alkanes is:", a: "CₙH₂ₙ₊₂", b: "CₙH₂ₙ", c: "CₙH₂ₙ₋₂", d: "CₙHₙ", correct: "A", explanation: "Alkanes are saturated hydrocarbons with the general formula CₙH₂ₙ₊₂. For example, methane (n=1): CH₄.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 14" },
    { topic: 5, text: "Which type of reaction is the addition of bromine to ethene?", a: "Addition reaction", b: "Substitution reaction", c: "Elimination reaction", d: "Condensation reaction", correct: "A", explanation: "Unsaturated compounds (alkenes like ethene) undergo addition reactions, where atoms add across the double bond: CH₂=CH₂ + Br₂ → CH₂BrCH₂Br", diff: "medium", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 15" },

    // Electrochemistry
    { topic: 6, text: "In electrolysis of brine, which gas is produced at the anode?", a: "Chlorine", b: "Hydrogen", c: "Oxygen", d: "Sodium", correct: "A", explanation: "During electrolysis of brine (NaCl solution), chlorine gas is produced at the anode (positive electrode) and hydrogen gas at the cathode (negative electrode).", diff: "medium", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 7" },

    // Periodic Table
    { topic: 7, text: "Elements in the same group of the periodic table have the same:", a: "Number of valence electrons", b: "Number of electron shells", c: "Atomic mass", d: "Number of neutrons", correct: "A", explanation: "Elements in the same group have the same number of valence (outer shell) electrons, giving them similar chemical properties.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 8" },
    { topic: 7, text: "Which of the following is a noble gas?", a: "Neon", b: "Nitrogen", c: "Sodium", d: "Nickel", correct: "A", explanation: "Neon (Ne) is a noble gas found in Group 18 (VIII). Noble gases have complete outer electron shells and are chemically inert.", diff: "easy", ref: "New School Chemistry by Osei Yaw Ababio, Chapter 8" },
  ];

  // Insert all questions across exam bodies and years
  let qNum = 1;
  const allSubjectQuestions = [
    { subjectId: maths.id, topicsList: mathTopics, questionsArr: mathQuestions },
    { subjectId: english.id, topicsList: engTopics, questionsArr: engQuestions },
    { subjectId: physics.id, topicsList: phyTopics, questionsArr: phyQuestions },
    { subjectId: chemistry.id, topicsList: chemTopics, questionsArr: chemQuestions },
  ];

  for (const { subjectId, topicsList, questionsArr } of allSubjectQuestions) {
    for (const body of bodies) {
      for (const year of years) {
        for (let i = 0; i < questionsArr.length; i++) {
          const q = questionsArr[i];
          db.insert(questions).values({
            examBodyId: body.id,
            subjectId,
            topicId: topicsList[q.topic]?.id ?? null,
            year,
            questionNumber: i + 1,
            questionText: q.text,
            optionA: q.a,
            optionB: q.b,
            optionC: q.c,
            optionD: q.d,
            correctAnswer: q.correct,
            explanation: q.explanation,
            difficulty: q.diff,
            textbookRef: JSON.stringify([q.ref]),
          }).run();
        }
      }
    }
  }

  // Study Tips
  const mathStudyTipData = [
    { title: "Master the Basics First", content: "Ensure you understand fundamental operations — fractions, decimals, percentages, and indices before moving to advanced topics. Practice mental arithmetic daily. Use New General Mathematics SS1-3 as your primary guide.", topicId: null },
    { title: "Practice with Past Questions", content: "Solve at least 20 past questions per topic per week. Time yourself to build exam speed. Focus on WAEC and JAMB patterns — they often repeat question styles.", topicId: null },
    { title: "Logarithms and Indices", content: "Memorize the laws of logarithms and indices. Practice converting between forms. Remember: log₁₀(ab) = log₁₀a + log₁₀b, and aⁿ × aᵐ = aⁿ⁺ᵐ", topicId: null },
    { title: "Quadratic Equations Strategy", content: "Learn all three methods: factorization, completing the square, and quadratic formula. Factorization is fastest when it works. Always check your answers by substitution.", topicId: null },
    { title: "Geometry Tips", content: "Draw clear diagrams and label all known values. Memorize area and volume formulas for common shapes. Remember: angles in a triangle = 180°, angles on a straight line = 180°.", topicId: null },
  ];

  const engStudyTipData = [
    { title: "Build Your Vocabulary Daily", content: "Learn 5 new words every day with their meanings, synonyms, and antonyms. Use them in sentences. Keep a vocabulary notebook. Read newspapers and novels regularly.", topicId: null },
    { title: "Comprehension Strategy", content: "Read the passage twice — first for general understanding, then for specific details. Underline key points. Answer questions in your own words unless asked to quote.", topicId: null },
    { title: "Grammar Rules to Master", content: "Focus on subject-verb agreement, tenses, prepositions, and concord. These are the most tested areas in WAEC and JAMB. Use 'English Grammar' by P.O. Olatunbosun.", topicId: null },
    { title: "Oral English Practice", content: "Practice stress patterns and vowel sounds daily. Record yourself speaking and compare with correct pronunciation. Pay attention to minimal pairs.", topicId: null },
  ];

  const phyStudyTipData = [
    { title: "Understand, Don't Memorize", content: "Physics requires understanding concepts, not memorizing formulas. Derive formulas yourself so you understand where they come from. New School Physics by M.W. Anyakoha is essential.", topicId: null },
    { title: "Master Units and Conversions", content: "Always include units in your calculations. Convert all measurements to SI units before solving. This prevents many common errors.", topicId: null },
    { title: "Draw Free Body Diagrams", content: "For mechanics problems, always draw a free body diagram showing all forces. This makes it much easier to set up equations correctly.", topicId: null },
  ];

  const chemStudyTipData = [
    { title: "Learn the Periodic Table", content: "Memorize the first 20 elements and their properties. Understand trends across periods and down groups. New School Chemistry by Osei Yaw Ababio covers this thoroughly.", topicId: null },
    { title: "Balance Equations First", content: "Before solving any stoichiometry problem, ensure the chemical equation is balanced. Count atoms on both sides. This is crucial for correct calculations.", topicId: null },
    { title: "Organic Chemistry Naming", content: "Master IUPAC naming conventions early. Learn the prefixes (meth-, eth-, prop-, but-) and functional group suffixes (-ol, -al, -one, -oic acid).", topicId: null },
  ];

  for (const tip of mathStudyTipData) {
    db.insert(studyTips).values({ subjectId: maths.id, topicId: tip.topicId, title: tip.title, content: tip.content }).run();
  }
  for (const tip of engStudyTipData) {
    db.insert(studyTips).values({ subjectId: english.id, topicId: tip.topicId, title: tip.title, content: tip.content }).run();
  }
  for (const tip of phyStudyTipData) {
    db.insert(studyTips).values({ subjectId: physics.id, topicId: tip.topicId, title: tip.title, content: tip.content }).run();
  }
  for (const tip of chemStudyTipData) {
    db.insert(studyTips).values({ subjectId: chemistry.id, topicId: tip.topicId, title: tip.title, content: tip.content }).run();
  }

  console.log("Database seeded successfully!");
}
