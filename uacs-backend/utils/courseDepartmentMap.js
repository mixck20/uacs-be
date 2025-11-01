// Course-to-Department mapping for University of the Assumption
// Auto-populates department field from course selection

const COURSE_TO_DEPARTMENT = {
  // College of Accountancy
  'BSA': 'College of Accountancy',
  'BSMA': 'College of Accountancy',
  
  // College of Hospitality and Tourism Management
  'BSHM': 'College of Hospitality and Tourism Management',
  'BSTM': 'College of Hospitality and Tourism Management',
  
  // School of Business and Public Administration
  'BSBA': 'School of Business and Public Administration',
  'BSE': 'School of Business and Public Administration',
  'BSPA': 'School of Business and Public Administration',
  
  // School of Education
  'BSED': 'School of Education',
  'BEED': 'School of Education',
  'BECEd': 'School of Education',
  
  // College of Nursing and Pharmacy
  'BSN': 'College of Nursing and Pharmacy',
  'BSPharma': 'College of Nursing and Pharmacy',
  
  // School of Arts and Sciences
  'AB-PSYCH': 'School of Arts and Sciences',
  'AB-POLSCI': 'School of Arts and Sciences',
  'AB-COMM': 'School of Arts and Sciences',
  'BS-PSYCH': 'School of Arts and Sciences',
  'BS-BIO': 'School of Arts and Sciences',
  
  // College of Engineering and Architecture
  'BSCE': 'College of Engineering and Architecture',
  'BSEE': 'College of Engineering and Architecture',
  'BSME': 'College of Engineering and Architecture',
  'BSArch': 'College of Engineering and Architecture',
  
  // College of Information Technology
  'BSIT': 'College of Information Technology',
  'BSCS': 'College of Information Technology',
  'BSCpE': 'College of Information Technology',
  
  // Institute of Theology and Religious Studies
  'BTh': 'Institute of Theology and Religious Studies',
  'AB-Theo': 'Institute of Theology and Religious Studies'
};

module.exports = { COURSE_TO_DEPARTMENT };
