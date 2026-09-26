const LESSONS = {
  Foundations: [
    ['Home row · First steps', 'fff jjj fff jjj fjfj jfjf'],
    ['Home row · All eight fingers', 'aaa sss ddd fff jjj kkk lll ;;; asdf jkl; asdf jkl;'],
    ['Home row · Small words', 'a sad lad asks a lass; a flask falls; dad adds a salad'],
    ['Top row · Reach and return', 'aqa sws ded frf ftf jyj juj kik lol ;p; quiet writer power'],
    ['Bottom row · Reach and return', 'aza sxs dcd fvf fbf jnj jmj k,k l.l ;/; mix vivid calm'],
    ['Capitals · Opposite Shift', 'A Sad Lad Jogs. Keep Your Fingers Relaxed. Think Then Type.'],
    ['Numbers & symbols · Code-ready', '12345 67890 () {} [] < > = + - * / ! & | ; : " \' _ %']
  ],
  TOEFL: [
    ['Words · Academic essentials', 'evidence research hypothesis significant interpret establish benefit indicate'],
    ['Words · Campus life', 'assignment seminar professor registration library deadline scholarship laboratory'],
    ['Sentence · Support an opinion', 'I believe that group projects help students develop communication skills.'],
    ['Sentence · Connect ideas', 'Although online courses are convenient, classroom discussions offer valuable interaction.'],
    ['Passage · Academic discussion', 'Universities should provide quiet study areas as well as spaces for collaboration. Some students concentrate best when they work alone, while others benefit from discussing difficult concepts with their peers. Offering both options allows students to choose the environment that suits the task.'],
    ['Passage · Campus email', 'Dear Professor Lee,\nI am writing to ask about the research assignment. Could you clarify whether we should compare two studies or focus on a single experiment? Thank you for your guidance.\nBest regards,\nAlex']
  ],
  IELTS: [
    ['Words · Trends & comparisons', 'increase decline fluctuate steadily approximately proportion whereas overall'],
    ['Words · Society & environment', 'sustainable transport employment infrastructure renewable community consumption'],
    ['Sentence · Describe a trend', 'The proportion of commuters travelling by train increased steadily over the period.'],
    ['Sentence · Develop an argument', 'Investment in public transport can reduce congestion and improve access to employment.'],
    ['Passage · Describe data', 'Overall, the use of public transport rose during the period, while car use declined. The largest increase was recorded among younger commuters. By the final year, buses and trains together accounted for more than half of all journeys to work.'],
    ['Passage · Discuss both views', 'Some people argue that schools should focus on practical skills, while others believe that academic knowledge is more important. In my view, both approaches have value. Practical activities give students experience, and academic study helps them understand the principles behind their decisions.']
  ],
  'AP CSA': [
    ['Words · Java vocabulary', 'class public private static void boolean double return String ArrayList'],
    ['Sentence · Explain an algorithm', 'A loop visits each element in the array and updates the running total.'],
    ['Code · Variables & expressions', 'int count = 0;\ndouble average = 85.5;\nboolean isReady = true;\nString message = "Hello, world!";'],
    ['Code · Conditionals', 'if (score >= 90) {\n    System.out.println("Excellent");\n} else {\n    System.out.println("Keep practicing");\n}'],
    ['Code · Array traversal', 'int total = 0;\nfor (int i = 0; i < values.length; i++) {\n    total += values[i];\n}'],
    ['Code · A method', 'public static int countPositive(int[] values) {\n    int count = 0;\n    for (int value : values) {\n        if (value > 0) {\n            count++;\n        }\n    }\n    return count;\n}'],
    ['Passage · Objects & references', 'A class defines the state and behavior of its objects. Instance variables store state, and methods describe behavior. Two reference variables can refer to the same object, so a change made through one reference may be visible through the other.']
  ]
};
