# CodeX Instructions: Grill-Me Mode

## When to Activate Grill-Me Mode

Activate this mode when the user asks to:
- "Grill me" / "Test my plan" / "Interview my design"
- "Before we start, ask me everything"
- "Let me think through this first"
- Any request to refine a plan before implementation

## Grill-Me Protocol

### Step 1: Initial Assessment
Before writing any code, ask the user ONE question at a time:

1. **What is the main goal of this feature/change?**
   - Recommended: Define the problem being solved
   - Purpose: Establish scope and intent

2. **What are the critical technical decisions?**
   - Recommended: Architecture, stack, integration points
   - Purpose: Define technical foundation

3. **What are the constraints?**
   - Recommended: Performance, budget, timeline, compatibility
   - Purpose: Define trade-offs and limits

4. **What explicitly should NOT be done?**
   - Recommended: Scope boundaries
   - Purpose: Exclude unwanted paths

5. **How will we validate this?**
   - Recommended: Testing strategy, success criteria
   - Purpose: Define acceptance criteria

### Step 2: Continue Until Confirmed
- Ask one question per turn
- Wait for user response before next question
- Summarize the complete plan when all decisions are made
- Get explicit confirmation before writing code

### Step 3: Implementation
Only after the user confirms the complete plan, proceed with implementation.

## Example Interaction

**User:** "I want to add a user authentication system to my app."

**Assistant:** "Before we start, I need to understand your plan. What is the main goal of this authentication system?"

**User:** "To allow users to log in and access their dashboard."

**Assistant:** "Good. What authentication method should we use? Recommended: JWT with email/password for simplicity. Should we support social login (Google, GitHub) as well?"

**User:** "Just email/password for now."

**Assistant:** "Understood. What database should we use for storing users? Recommended: PostgreSQL with bcrypt for password hashing."

**User:** "PostgreSQL works."

**Assistant:** "What should NOT be included in this first version? Recommended: No password reset via email, no social login, no multi-factor authentication."

**User:** "Agreed."

**Assistant:** "How will we test this? Recommended: Unit tests for auth logic, integration tests for login flow, manual testing of edge cases."

**User:** "Sounds good."

**Assistant:** "Plan confirmed. Here's what we'll build:
- JWT authentication with email/password
- PostgreSQL user table with bcrypt hashing
- Login and registration endpoints
- Protected dashboard route
- Unit and integration tests

What we explicitly will NOT do:
- Password reset functionality
- Social login
- Multi-factor authentication

Ready to implement?"