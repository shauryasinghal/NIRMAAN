"""Seeds realistic demo data — never real student PII, clearly marked as a demo dataset.
Deadlines are stored as real dates, offset from "today" at seed time, so the
demo always looks current instead of drifting into the past.
"""
import datetime as dt
from sqlalchemy.orm import Session
from . import models, security
from .opportunity_classify import classify_category, classify_participation, classify_source_type

TODAY = dt.date.today()


def _in(days: int) -> dt.date:
    return TODAY + dt.timedelta(days=days)


# (title, organization, domain, required_skills, format, difficulty, deadline_offset_days, external_url)
OPPORTUNITIES = [
    ("Smart India Hackathon 2026", "Ministry of Education, Govt. of India", "Open Innovation", ["python", "machine learning", "system design"], "hybrid", "intermediate", 45, "https://sih.gov.in"),
    ("HackVerse 5.0", "IIIT Allahabad", "AI/ML", ["python", "nlp", "deep learning"], "offline", "intermediate", 35, "https://unstop.com"),
    ("FinTech Innovate Challenge", "Razorpay", "FinTech", ["python", "javascript", "react", "api design"], "online", "intermediate", 60, "https://razorpay.com/build"),
    ("HealthTech Precision Challenge", "GE HealthCare", "HealthTech", ["machine learning", "data science", "python"], "hybrid", "advanced", 75, "https://unstop.com"),
    ("Open Source Contribution Sprint", "GitHub Education", "Open Innovation", ["git", "python", "javascript"], "online", "beginner", 20, "https://education.github.com"),
    ("ClimateTech Builders Cup", "Unstop", "ClimateTech", ["data science", "python", "iot"], "online", "intermediate", 40, "https://unstop.com"),
    ("EdTech Product Sprint", "Unstop", "EdTech", ["react", "ui/ux", "javascript"], "online", "beginner", 15, "https://unstop.com"),
    ("CyberSecure CTF", "HackerEarth", "Cybersecurity", ["cybersecurity", "networking", "python"], "online", "advanced", 30, "https://hackerearth.com"),
    ("DevPost Global AI Buildathon", "Devpost", "AI/ML", ["python", "machine learning", "cloud"], "online", "intermediate", 55, "https://devpost.com"),
    ("Campus Innovation Challenge", "GLA University", "Open Innovation", ["python", "react", "sql"], "offline", "beginner", 10, "https://gla.ac.in"),
    ("Kaggle Student Data Science Bowl", "Kaggle", "Data Science", ["python", "machine learning", "data science"], "online", "advanced", 65, "https://kaggle.com"),
    ("Flipkart GRiD Campus Challenge", "Flipkart", "Web Development", ["java", "react", "sql", "api design"], "hybrid", "intermediate", 50, "https://unstop.com"),
    ("Paytm FinTech Hackfest", "Paytm", "FinTech", ["python", "sql", "api design"], "online", "intermediate", 25, "https://unstop.com"),
    ("Google Developer Groups Solution Challenge", "Google Developer Groups", "Open Innovation", ["cloud", "python", "ui/ux"], "hybrid", "intermediate", 70, "https://developers.google.com"),
    ("Microsoft Learn Student Ambassador Sprint", "Microsoft Learn Student", "Cloud", ["cloud", "devops", "python"], "online", "beginner", 18, "https://studentambassadors.microsoft.com"),
    ("AWS Educate Cloud Innovation Cup", "AWS Educate", "Cloud", ["cloud", "python", "devops"], "online", "advanced", 80, "https://aws.amazon.com/education"),
    ("NVIDIA Inception Student AI Challenge", "NVIDIA Inception", "AI/ML", ["python", "deep learning", "machine learning"], "hybrid", "advanced", 90, "https://nvidia.com/inception"),
    ("ISRO Bhartiya Antariksh Hackathon", "ISRO", "Open Innovation", ["python", "data science", "iot"], "offline", "advanced", 100, "https://isro.gov.in"),
    ("Zomato Product Design Jam", "Zomato", "Web Development", ["ui/ux", "figma", "react"], "online", "beginner", 22, "https://unstop.com"),
    ("Infosys Springboard InnovateX", "Infosys Springboard", "Open Innovation", ["java", "python", "sql"], "hybrid", "intermediate", 42, "https://infyspringboard.onwingspan.com"),
    ("HackerEarth CodeSprint AI", "HackerEarth", "AI/ML", ["python", "machine learning", "nlp"], "online", "intermediate", 33, "https://hackerearth.com"),
    ("Devfolio Web3 & AI Buildathon", "Devfolio", "Open Innovation", ["javascript", "python", "api design"], "online", "intermediate", 48, "https://devfolio.co"),
    ("GLA University AI Research Symposium", "GLA University", "AI/ML", ["python", "machine learning", "data science"], "offline", "advanced", 58, "https://gla.ac.in"),
    ("Unstop Campus Ambassador Design Sprint", "Unstop", "EdTech", ["ui/ux", "figma"], "online", "beginner", 12, "https://unstop.com"),
    ("HealthTech IoT Challenge", "GE HealthCare", "HealthTech", ["iot", "python", "data science"], "hybrid", "intermediate", 68, "https://unstop.com"),
    ("Cybersecurity Capture the Flag — National Finals", "HackerEarth", "Cybersecurity", ["cybersecurity", "networking", "cloud"], "offline", "advanced", 85, "https://hackerearth.com"),
    ("Devpost Climate Resilience Hack", "Devpost", "ClimateTech", ["python", "data science", "iot"], "online", "intermediate", 38, "https://devpost.com"),
    ("Razorpay Student Builder Sprint", "Razorpay", "FinTech", ["javascript", "react", "api design", "cloud"], "online", "beginner", 16, "https://razorpay.com/build"),
    ("Smart India Hackathon — Software Edition", "Ministry of Education, Govt. of India", "Open Innovation", ["python", "react", "sql", "cloud"], "hybrid", "intermediate", 95, "https://sih.gov.in"),
    ("GitHub Copilot Student Challenge", "GitHub Education", "AI/ML", ["python", "javascript", "git"], "online", "beginner", 27, "https://education.github.com"),
    ("Kaggle Playground Prediction Series", "Kaggle", "Data Science", ["python", "data science", "sql"], "online", "beginner", 14, "https://kaggle.com"),
    ("Flipkart Runway UX Design Challenge", "Flipkart", "EdTech", ["ui/ux", "figma", "css"], "online", "beginner", 21, "https://unstop.com"),
    ("AWS Educate DevOps Bootcamp Challenge", "AWS Educate", "DevOps", ["devops", "docker", "cloud"], "online", "intermediate", 44, "https://aws.amazon.com/education"),
    ("Google Cloud Arcade Facilitator Challenge", "Google Developer Groups", "Cloud", ["cloud", "devops"], "online", "beginner", 9, "https://cloudskillsboost.google"),
    ("Devfolio EdTech for Bharat Hack", "Devfolio", "EdTech", ["react", "javascript", "ui/ux"], "hybrid", "intermediate", 52, "https://devfolio.co"),
    ("NVIDIA Deep Learning Institute Student Cup", "NVIDIA Inception", "AI/ML", ["deep learning", "python", "cloud"], "online", "advanced", 78, "https://nvidia.com/inception"),
    ("Paytm Payments Innovation Lab", "Paytm", "FinTech", ["java", "sql", "cybersecurity"], "hybrid", "advanced", 62, "https://unstop.com"),
    ("HackerEarth Cloud-Native Challenge", "HackerEarth", "DevOps", ["docker", "cloud", "devops"], "online", "intermediate", 31, "https://hackerearth.com"),
    ("Devpost Accessibility-First Hack", "Devpost", "Web Development", ["react", "ui/ux", "javascript"], "online", "beginner", 19, "https://devpost.com"),
    ("ISRO Student Satellite Data Challenge", "ISRO", "Data Science", ["python", "data science", "machine learning"], "offline", "advanced", 110, "https://isro.gov.in"),
    ("GLA University Cybersecurity Week CTF", "GLA University", "Cybersecurity", ["cybersecurity", "networking", "python"], "offline", "intermediate", 24, "https://gla.ac.in"),
    ("Zomato Data Science Case Cup", "Zomato", "Data Science", ["python", "data science", "sql"], "online", "intermediate", 36, "https://unstop.com"),
    ("Infosys Springboard Full-Stack Sprint", "Infosys Springboard", "Web Development", ["java", "react", "api design"], "hybrid", "intermediate", 47, "https://infyspringboard.onwingspan.com"),
    ("Microsoft Imagine Cup India Qualifiers", "Microsoft Learn Student", "AI/ML", ["python", "machine learning", "cloud"], "hybrid", "advanced", 88, "https://imaginecup.microsoft.com"),
    ("Unstop ClimateTech Ideathon", "Unstop", "ClimateTech", ["iot", "data science"], "online", "beginner", 13, "https://unstop.com"),
    ("Kaggle NLP Getting Started Challenge", "Kaggle", "AI/ML", ["python", "nlp", "machine learning"], "online", "beginner", 17, "https://kaggle.com"),
    ("Devfolio Fintech for Bharat Hack", "Devfolio", "FinTech", ["python", "api design", "sql"], "online", "intermediate", 41, "https://devfolio.co"),
    ("Razorpay Security & Trust Challenge", "Razorpay", "Cybersecurity", ["cybersecurity", "python", "api design"], "online", "advanced", 73, "https://razorpay.com/build"),
    ("GitHub Education Open Source Day", "GitHub Education", "Open Innovation", ["git", "python", "javascript"], "online", "beginner", 8, "https://education.github.com"),
    ("Kaggle Computer Vision Sprint", "Kaggle", "AI/ML", ["python", "deep learning", "data science"], "online", "intermediate", 29, "https://kaggle.com"),
]

FIRST_NAMES = ["Ananya", "Rohit", "Priya", "Karan", "Sneha", "Aditya", "Ishita", "Vikram", "Meera", "Arjun",
               "Divya", "Rahul", "Neha", "Siddharth", "Pooja", "Amit", "Kavya", "Rajesh", "Anjali", "Varun",
               "Riya", "Manish", "Tanvi", "Aryan", "Simran", "Nikhil", "Shreya", "Harsh", "Diya", "Yash"]
LAST_NAMES = ["Sharma", "Verma", "Nair", "Mehta", "Iyer", "Rao", "Gupta", "Singh", "Joshi", "Kapoor",
              "Menon", "Chatterjee", "Reddy", "Bansal", "Malhotra", "Kulkarni", "Pillai", "Agarwal", "Bose", "Chauhan"]

SKILL_ARCHETYPES = [
    ("frontend", ["react", "javascript", "ui/ux", "css"]),
    ("backend", ["python", "sql", "api design", "cloud"]),
    ("ml", ["python", "machine learning", "deep learning", "nlp"]),
    ("design", ["ui/ux", "figma", "css"]),
    ("data", ["data science", "python", "sql"]),
    ("devops", ["cloud", "docker", "devops"]),
    ("security", ["cybersecurity", "networking", "python"]),
    ("fullstack", ["react", "python", "sql", "api design"]),
    ("nlp", ["python", "nlp", "machine learning"]),
    ("iot", ["python", "iot", "data science"]),
]

PRIOR_IDEAS = [
    ("Skill-based hackathon teammate finder", "A platform for finding teammates with matching or complementary technical skills for hackathons."),
    ("Recipe recommender using pantry items", "An app that suggests recipes based on ingredients already available at home."),
    ("Campus lost-and-found tracker", "A web app where students can report and search for lost items on campus."),
    ("AI resume screening tool", "A tool that scores resumes against a job description using keyword and semantic matching."),
    ("Peer-to-peer tutoring marketplace", "A platform connecting students who need help in a subject with peers who can tutor them."),
    ("Carbon footprint tracker for students", "An app that estimates a student's daily carbon footprint from commute and food choices."),
    ("Duplicate hackathon idea checker", "A system that checks a submitted hackathon idea against a database of past submissions for similarity."),
    ("Mental wellness check-in chatbot", "A chatbot that periodically checks in on student mental wellness and suggests resources."),
    ("Local event discovery app", "An app that aggregates and recommends local college events based on user interests."),
    ("Expense splitting app for roommates", "A mobile app to track and split shared expenses among roommates."),
    ("Attendance tracker with face recognition", "A classroom attendance system that identifies students automatically from a camera feed."),
    ("Second-hand textbook marketplace", "A campus marketplace for buying and selling used textbooks between students."),
    ("Smart timetable clash detector", "A tool that flags scheduling conflicts when students pick elective courses."),
    ("Placement preparation tracker", "An app that helps students track coding practice and interview preparation progress."),
    ("Hostel maintenance complaint portal", "A ticketing system for students to report and track hostel maintenance issues."),
    ("Carpooling app for campus commute", "An app matching students travelling similar routes to campus for shared rides."),
    ("Skill-swap platform for students", "A platform where students teach each other skills in exchange for learning a different skill."),
    ("Study group matcher by course and goals", "An app that groups students preparing for the same exam into study groups."),
    ("Campus event ticketing and check-in", "A QR-code based ticketing and check-in system for college fests and events."),
    ("Personal finance tracker for students", "A budgeting app tailored to student income and expense patterns."),
    ("Plagiarism checker for assignment submissions", "A tool that flags textual overlap between submitted assignments and existing sources."),
    ("Internship application tracker", "A dashboard for students to track internship applications, deadlines, and interview stages."),
    ("Campus noise complaint heatmap", "A crowdsourced map showing noise complaint hotspots across a college campus."),
    ("Volunteer hour tracking app", "An app that logs and verifies student volunteering hours for community service credit."),
    ("Lab equipment booking system", "A scheduling system for students to reserve shared lab equipment slots."),
    ("Anonymous campus feedback board", "A moderated board where students can post anonymous feedback about courses and facilities."),
    ("Cafeteria menu and crowd predictor", "An app predicting cafeteria crowd levels and today's menu based on past patterns."),
    ("Alumni mentorship matching platform", "A platform connecting current students with alumni mentors in similar career paths."),
    ("Group project task tracker", "A lightweight Kanban-style tracker built specifically for student group project deadlines."),
    ("Bike/cycle rental app for campus", "An app for renting shared bicycles across a large university campus."),
    ("Scholarship eligibility matcher", "A tool that matches a student's profile against scholarships they're eligible to apply for."),
    ("Language exchange partner finder", "An app pairing students who want to practice speaking each other's native languages."),
    ("Club and society discovery app", "An app helping new students discover and join campus clubs matching their interests."),
    ("Exam seating arrangement generator", "A tool that auto-generates non-adjacent seating charts for large exam halls."),
    ("Peer code review scheduler", "A tool matching students to review each other's code submissions before deadlines."),
    ("Campus WiFi dead-zone mapper", "A crowdsourced app mapping weak WiFi signal areas across a college campus."),
    ("Doubt-solving Q&A app for coursework", "A course-specific Q&A forum where students post and answer doubts."),
    ("Freelance gig board for students", "A campus-only marketplace for small freelance gigs between students."),
    ("Sustainable campus energy dashboard", "A dashboard visualizing real-time energy usage across campus buildings."),
    ("Roommate compatibility matcher", "A quiz-based app matching incoming students with compatible roommates."),
    ("Open-source contribution tracker for students", "A dashboard tracking a student's open-source contributions across GitHub repos."),
    ("Campus safety SOS app", "An app that lets students quickly alert campus security and nearby friends in an emergency."),
    ("Group expense settlement optimizer", "An app that minimizes the number of transactions needed to settle shared group expenses."),
    ("Course prerequisite visualizer", "A tool visualizing prerequisite chains across a degree program's course catalogue."),
    ("Hackathon idea brainstorm board", "A collaborative board for teams to brainstorm and vote on hackathon ideas before committing."),
    ("Student subletting board", "A board for students to list and find short-term room sublets during breaks."),
    ("Time-boxed focus session app", "A Pomodoro-style focus timer app with shared study room sessions for students."),
    ("Career fair booth navigator", "An app that maps career fair booths and helps students plan which companies to visit."),
    ("Peer skill endorsement network", "A LinkedIn-style network where students endorse each other's demonstrated project skills."),
    ("Lecture notes sharing and search", "A searchable repository of student-shared lecture notes organized by course."),
]


def run(db: Session):
    if db.query(models.Opportunity).count() > 0:
        return  # already seeded

    for title, org, domain, skills, fmt, diff, offset, url in OPPORTUNITIES:
        category = classify_category(title)
        participation, min_team, max_team = classify_participation(category)
        db.add(models.Opportunity(
            title=title, organization=org, domain=domain, required_skills=skills,
            category=category, participation=participation, min_team_size=min_team, max_team_size=max_team,
            format=fmt, difficulty=diff, deadline=_in(offset),
            description=f"{title} hosted by {org} — a {domain} focused opportunity for students.",
            source=org, source_type=classify_source_type(org), external_url=url,
        ))

    for i in range(30):
        first = FIRST_NAMES[i % len(FIRST_NAMES)]
        last = LAST_NAMES[(i * 7) % len(LAST_NAMES)]
        name = f"{first} {last}"
        tag, skills = SKILL_ARCHETYPES[i % len(SKILL_ARCHETYPES)]
        email = f"{first.lower()}.{last.lower()}{i}@gla.demo"
        db.add(models.Student(
            name=name, email=email,
            hashed_password=security.hash_password("demo1234"),
            role="STUDENT", branch="CSE (AI/ML)", year=str((i % 4) + 1),
            skills=skills, interests=[tag], experience_level=["beginner", "intermediate", "advanced"][i % 3],
            availability_hrs=5 + (i % 6) * 3, profile_complete=True,
        ))

    # A stable, memorable demo login used throughout the README/frontend
    db.add(models.Student(
        name="Priya Nair", email="priya.nair@gla.demo",
        hashed_password=security.hash_password("demo1234"),
        role="STUDENT", branch="CSE (AI/ML)", year="3",
        skills=["python", "machine learning", "deep learning", "nlp"], interests=["ai/ml"],
        experience_level="intermediate", availability_hrs=8, profile_complete=True,
    ))

    for title, desc in PRIOR_IDEAS:
        db.add(models.PriorIdea(title=title, description=desc, source="Seeded prior-idea corpus"))

    # A demo reviewer account
    db.add(models.Student(
        name="Reviewer Demo", email="reviewer@gla.demo",
        hashed_password=security.hash_password("demo1234"),
        role="REVIEWER", profile_complete=True,
    ))

    db.commit()
