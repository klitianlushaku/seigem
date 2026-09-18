Build a real, production-ready web application named Seigem.
Seigem converts uploaded PDF, Word, and PowerPoint files into summaries, flashcards, and quizzes.
The application must be fully functional, not a static mockup or visual prototype.
Use a modern TypeScript-based full-stack architecture.
Use Next.js with TypeScript for the main web application.
Use Tailwind CSS for styling.
Use Firebase Authentication for user authentication.
Use Firebase Firestore as the database.
Use the Firebase Admin SDK only on secure server-side code where required.
Use Google authentication through Firebase Auth.
Use DeepSeek API for AI generation.
Use Whop as the payment and subscription provider.
The entire customer-facing website content must be written in Albanian.
Code names, variable names, database fields, comments, and developer documentation may remain in English.
The website must use a simple dark dashboard design.
Do not use gradients anywhere.
Do not use decorative AI-generated graphics or random decorative components.
Do not waste development time building complicated animations or visual effects.
Prioritize functionality, usability, performance, privacy, and security.
Complete Task 1 only, show me what was created, and explicitly ask me before starting Task 2.
TASK 2: Create the core project structure and development configuration.
Use a clean folder architecture separating pages, components, services, server code, utilities, types, and Firebase configuration.
Enable TypeScript strict mode.
Configure ESLint.
Configure Tailwind CSS.
Add reusable UI components only when they actually reduce duplication.
Do not install a large UI component library unless there is a strong technical reason.
Use simple accessible HTML components styled with Tailwind whenever possible.
Create folders for authentication, dashboard, document processing, AI generation, billing, history, and API routes.
Create a centralized application configuration file for plan limits.
Never hardcode API secrets inside frontend source code.
Create an .env.example file.
Create a .env.local file placeholder but never commit real secret values.
Add .env.local and other secret files to .gitignore.
Add clear comments showing which environment variables are public and which must remain server-only.
Create a README with local development instructions.
Include installation commands in the README.
Include Firebase setup instructions in the README.
Include DeepSeek and Whop setup instructions in the README.
Stop after Task 2 and ask me explicitly whether you may start Task 3.
TASK 3: Create the complete environment-variable structure.
Add NEXT_PUBLIC_FIREBASE_API_KEY.
Add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.
Add NEXT_PUBLIC_FIREBASE_PROJECT_ID.
Add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET only if technically required by Firebase configuration.
Add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID.
Add NEXT_PUBLIC_FIREBASE_APP_ID.
Add FIREBASE_PROJECT_ID for Firebase Admin.
Add FIREBASE_CLIENT_EMAIL for Firebase Admin.
Add FIREBASE_PRIVATE_KEY for Firebase Admin.
Add DEEPSEEK_API_KEY.
Add DEEPSEEK_BASE_URL.
Add DEEPSEEK_STANDARD_MODEL.
Add DEEPSEEK_PRO_MODEL.
Use the normal DeepSeek model for Free and Plus users.
Use the stronger reasoning-capable DeepSeek model for Pro users when appropriate.
Add WHOP_API_KEY.
Add WHOP_WEBHOOK_SECRET.
Add WHOP_PLUS_PRODUCT_ID and WHOP_PRO_PRODUCT_ID.
Add NEXT_PUBLIC_APP_URL, document every variable, then stop and ask before Task 4.
TASK 4: Implement authentication.
Create a simple login page using Firebase Authentication.
The primary authentication method must be Google Sign-In.
Display the button text as Vazhdo me Google.
Add the Seigem name clearly at the top of the authentication page.
Keep the authentication page minimal and dark.
Do not add fake testimonials or marketing statistics.
After authentication, redirect the user directly to /dashboard.
Protect all dashboard routes from unauthenticated access.
Redirect unauthenticated visitors attempting to access protected pages back to login.
Create a Firebase user profile after the user's first successful login.
Store the user's UID.
Store the user's display name when available.
Store the user's email when available.
Store the account creation timestamp.
Store the user's active plan.
New users must receive the free plan automatically.
Never store passwords because authentication is handled by Firebase.
Add a logout action inside the dashboard account menu.
Test the authentication flow, stop after Task 4, and ask permission to start Task 5.
TASK 5: Create the Firestore architecture with strict privacy rules.
Never store uploaded PDF files in Firestore.
Never store uploaded Word files in Firestore.
Never store uploaded PowerPoint files in Firestore.
Never store the complete extracted document text in Firestore.
Never store document pages, paragraphs, slide XML, or file binary data in Firestore.
Document-related persistent data may contain the document title.
Document-related persistent data may contain the generated summary.
Document-related persistent data may contain generated flashcards.
Document-related persistent data may contain generated quiz questions and answers.
Store generation timestamps where operationally necessary.
Store the owner UID to ensure each record belongs to the correct account.
Account metadata may separately contain the user's subscription plan.
Account metadata may separately contain daily usage counters required to enforce plan limits.
These operational account fields do not count as persisted document content.
Create a collection for user profiles.
Create a collection or user subcollection for generated study sets.
Each study set must belong to exactly one authenticated user.
Write strict Firestore security rules preventing users from accessing another user's data.
Finish and test Firestore rules, then stop and ask me before starting Task 6.
TASK 6: Implement local document text extraction without AI.
Extraction itself must never use DeepSeek or any other AI model.
Whenever technically practical, parse documents directly inside the browser.
Original uploaded file bytes should remain in browser memory instead of being permanently uploaded.
Support .pdf files.
Use a reliable PDF parsing library such as PDF.js to extract selectable text from PDFs.
Support .docx Microsoft Word files.
Use a library such as Mammoth to extract text from DOCX files.
Support .pptx Microsoft PowerPoint files.
Extract PowerPoint text using deterministic ZIP/XML parsing rather than AI.
A PPTX file may be opened using a ZIP parser such as JSZip.
Parse text nodes from the relevant slide XML files.
Preserve the logical order of slides whenever possible.
Combine extracted slide text into normalized plain text.
Do not perform OCR automatically.
If a PDF contains no selectable text, show an Albanian message explaining that scanned PDFs are not currently supported.
Normalize excessive whitespace and empty lines after extraction.
Do not save normalized raw text to Firestore.
Dispose of the original file and temporary extracted text from application state when it is no longer required.
Demonstrate extraction for all three formats, stop, and ask me before starting Task 7.
TASK 7: Create the main dashboard.
/dashboard must be the main screen users see after logging in.
Use a near-black or dark charcoal page background.
Use simple lighter dark cards with clear borders.
Do not use gradients.
Do not use neon effects.
Do not use glassmorphism.
Do not use floating decorative shapes.
Do not use generic AI sparkles everywhere.
Keep icons minimal and functional.
Place Seigem clearly in the dashboard header or sidebar.
The main dashboard call-to-action should be the document uploader.
Use Albanian text such as Ngarko materialin.
Explain accepted formats as PDF, Word ose PowerPoint.
Add drag-and-drop uploading.
Also provide a normal file-selection button.
Show the currently selected filename.
Show a loading state while text is being extracted or study content is being generated.
Display clear Albanian error messages.
Complete the dashboard interface, stop after Task 7, and ask before Task 8.
TASK 8: Create the document-to-study-content workflow.
When the user selects a document, extract its text without AI.
Validate that readable text was found.
Automatically derive a simple title from the filename initially.
Allow the user to edit the title before generation.
Ask what they want to generate from the document.
Provide the options Përmbledhje, Flashcards, and Kuiz.
Allow selecting more than one generation type.
Check the user's plan limits before making any AI request.
Do not consume usage allowance when document extraction itself fails.
Send only the necessary extracted text to the secure server generation endpoint.
Never expose the DeepSeek API key in the browser.
The server must authenticate the Firebase user before calling DeepSeek.
The server must re-check the user's limits rather than trusting frontend checks.
Generate structured AI output rather than arbitrary uncontrolled text.
Validate the AI response before saving it.
Save only the title and selected generated content.
Do not save the source text after generation.
Clear temporary extracted text from active state after the process has completed.
Complete and test this workflow, stop, and ask permission before starting Task 9.
TASK 9: Implement DeepSeek AI generation.
Create a secure server-side DeepSeek service.
Never call DeepSeek directly from public client-side JavaScript.
Use DEEPSEEK_API_KEY exclusively on the server.
Use Albanian prompts because generated educational content must be in Albanian.
Generated summaries should focus on the most important concepts from the uploaded material.
Avoid unnecessarily long summaries.
Preserve technical terminology when it appears in the source.
Flashcards must contain a clear question or front side.
Flashcards must contain a concise answer or back side.
Quiz questions should be useful for studying rather than trivial.
Each quiz question should have one clearly identifiable correct answer.
Prefer multiple-choice quizzes with four options when suitable.
Include the correct answer in stored quiz data.
Include a short explanation when useful.
Request machine-readable structured JSON from DeepSeek.
Validate returned JSON using a schema before using it.
Gracefully handle malformed model responses and retry safely where appropriate.
Do not save failed or incomplete generation results.
Finish the DeepSeek integration, stop, and ask me explicitly before starting Task 10.
TASK 10: Implement Free, Plus, and Pro plans.
Create exactly three user plans: Free, Plus, and Pro.
The Free plan costs €0.
Free users may process a maximum of 2 uploaded documents per day.
Free users may generate a maximum of 3 flashcards per day.
Free users may generate a maximum of 3 quiz questions per day.
The Plus plan costs €5.99.
Plus users may process a maximum of 50 uploaded documents per day.
Plus users may generate a maximum of 50 flashcards per day.
Plus users may generate a maximum of 50 quiz questions per day.
The Pro plan costs €12.99.
Pro users may process a maximum of 200 uploaded documents per day.
Pro users may generate a maximum of 200 flashcards per day.
Pro users may generate a maximum of 200 quiz questions per day.
Pro users should receive access to the stronger configured DeepSeek model.
A summary generated from a successfully processed upload does not need a separate daily summary counter.
Keep plan numbers in centralized configuration instead of repeating magic values throughout the code.
Daily quota calculations must be enforced on the server.
Display the remaining daily limits inside the dashboard.
Finish plan enforcement, stop after Task 10, and request my approval before Task 11.
TASK 11: Implement daily usage tracking safely.
Usage limits must reset based on a consistent server-side day boundary.
Never depend exclusively on the user's browser clock.
Maintain per-user daily upload usage.
Maintain per-user daily flashcard generation usage.
Maintain per-user daily quiz-question generation usage.
A request for 10 flashcards should consume 10 flashcard units.
A request for 10 quiz questions should consume 10 quiz-question units.
Prevent a generation request if it would exceed the remaining quota.
Tell the user exactly how many units remain.
Show quota messages in Albanian.
Example: Të kanë mbetur 2 pyetje kuizi për sot.
Do not charge quota for failed DeepSeek requests when no usable result is returned.
Protect usage-counter updates against concurrent requests.
Use Firestore transactions or another atomic mechanism where necessary.
Never allow frontend code to arbitrarily increase its own quota.
The server must determine the user's current subscription plan.
Prevent manipulating the frontend to unlock Pro limits.
Add automated tests for important limit calculations if practical.
Complete the counter system, stop, and ask me before proceeding to Task 12.
TASK 12: Integrate Whop subscriptions and payments.
Create a pricing page in Albanian.
Display Free as Falas.
Display Plus as 5.99€.
Display Pro as 12.99€.
Clearly show each plan's daily usage limits.
Add Përmirëso planin actions for paid tiers.
Use Whop's official supported checkout or subscription flow.
Keep Whop secret credentials on the server.
Never mark a user as paid just because the frontend redirects back from checkout.
Use verified Whop webhook events as the source of truth for subscription activation.
Verify the webhook signature using the Whop webhook secret.
Link Whop subscription/customer information to the authenticated Firebase user safely.
When Plus payment becomes active, update the user's account plan to plus.
When Pro payment becomes active, update the user's account plan to pro.
Handle subscription cancellation.
Handle subscription expiration.
Handle payment or entitlement revocation.
Downgrade accounts appropriately when paid access is no longer valid.
Test the billing-state logic, stop, and request permission before starting Task 13.
TASK 13: Create saved study-set history and regeneration behavior.
Add a dashboard section called Materialet e mia.
Show previously generated study sets belonging to the authenticated user.
Each history item should show its title.
Show which generated resources exist for that title.
Allow opening the saved summary.
Allow opening saved flashcards.
Allow opening saved quiz questions.
Do not attempt to display or retrieve the original uploaded document because it was never stored.
Do not claim that Seigem permanently remembers the original document text.
When a user requests additional material for an existing study set, first use its stored title.
Also use its existing saved summary, flashcards, and quiz content as context when useful.
Do not pretend that a title alone contains the entire original document.
If existing saved information is insufficient for accurate additional generation, ask the user to re-upload the original document.
Re-uploaded document text must again remain temporary.
Additional generated content must respect the user's current daily plan limits.
Merge newly generated flashcards safely with saved flashcards when requested.
Merge newly generated quiz questions safely when requested.
Avoid obvious duplicate flashcards and quiz questions.
Finish history and regeneration behavior, stop, and ask me before starting Task 14.
TASK 14: Build the study experience.
Create a clean summary reading screen.
Make summaries readable with headings, paragraphs, and simple lists where necessary.
Create an interactive flashcard screen.
Show one flashcard at a time.
Allow clicking or tapping to reveal the answer.
Add previous and next controls.
Show flashcard progress such as 4 / 20.
Create an interactive quiz screen.
Present one quiz question at a time.
Allow the student to select an answer before revealing correctness.
Clearly show whether the selected answer was correct or incorrect.
Show the correct answer after submission.
Show the explanation when one exists.
Track quiz score in temporary session state.
Show the final score after completing the quiz.
The score does not need to be permanently saved unless added later.
Make study screens responsive on desktop, tablet, and mobile.
Keep visual styling consistent with the dark dashboard.
Finish study mode, stop, and explicitly ask me before starting Task 15.
TASK 15: Security, final testing, and production readiness.
Validate file extensions and MIME types before processing.
Add sensible maximum file-size limits to prevent abuse.
Add sensible maximum extracted-text limits before sending content to DeepSeek.
Sanitize untrusted filenames and user-provided titles.
Never render model-generated HTML directly without sanitization.
Require valid Firebase authentication tokens for protected server endpoints.
Add rate limiting to expensive AI endpoints where practical.
Never return server environment secrets in API responses or error messages.
Configure production Firestore security rules.
Test that one user cannot access another user's generated content.
Test Free, Plus, and Pro quota boundaries.
Test PDF extraction.
Test DOCX extraction.
Test PPTX extraction.
Test DeepSeek failure handling and malformed-response handling.
Test Whop webhook verification and subscription changes.
Test logout, login persistence, responsive layouts, loading states, and major error states.
Produce a final README explaining setup, required environment variables, Firebase configuration, DeepSeek configuration, Whop configuration, local development, and deployment.
After completing Task 15, stop completely, summarize what is finished and what remains, and do not add or change anything else unless I explicitly ask you to continue.