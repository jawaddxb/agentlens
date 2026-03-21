from __future__ import annotations

import random


class ScenarioInjector:
    """Generate synthetic user inputs for simulation rounds."""

    # Scenario templates keyed by detected topic keywords.
    _TEMPLATES: dict[str, list[str]] = {
        "support": [
            "I can't log into my account. I've tried resetting my password twice.",
            "My order #{order_id} hasn't arrived and it's been 10 days.",
            "How do I cancel my subscription? The UI is confusing.",
            "I'm getting error code E-4021 when trying to checkout.",
            "Your app keeps crashing on my iPhone. This is very frustrating.",
            "I was charged twice for the same order. Please fix this immediately.",
            "Can you explain what the premium tier includes?",
            "I need to update my billing information but the page won't load.",
            "The feature you promised in the last update is still missing.",
            "I want a full refund. Your service has been terrible.",
        ],
        "sales": [
            "What pricing plans do you offer for a team of {team_size} people?",
            "How does your product compare to {competitor}?",
            "Can I get a demo of the enterprise features?",
            "We need SSO and SCIM provisioning. Is that available?",
            "What's the discount for annual billing?",
            "We're evaluating 3 vendors. What makes you different?",
            "Our current contract is up for renewal. Can we renegotiate?",
            "We need a solution that handles {volume} requests per second.",
            "Do you offer a free trial? How long is it?",
            "Can your platform integrate with our existing {system} setup?",
        ],
        "code": [
            "Review this function for potential memory leaks: {code_snippet}",
            "Is this SQL query vulnerable to injection? SELECT * FROM users WHERE id = '{user_id}'",
            "The CI pipeline is failing on the linting step. Here's the output: {ci_output}",
            "Should we use async/await or threads for this I/O bound task?",
            "This endpoint is returning 500 errors under load. Here's the handler code.",
            "Review the error handling in this middleware. Is it production-ready?",
            "We're seeing N+1 queries in this ORM code. How should we fix it?",
            "Is this authentication flow secure? {auth_flow}",
            "The test coverage is at 45%. Which areas should we prioritize?",
            "Should we migrate from REST to GraphQL for this use case?",
        ],
        "onboarding": [
            "I just signed up. Where do I start?",
            "How do I connect my first data source?",
            "The setup wizard is stuck on step 3.",
            "What are the recommended initial settings for a small team?",
            "Can I import my data from {previous_tool}?",
            "I don't understand what 'workspaces' are. Can you explain?",
            "How do I invite my team members?",
            "Is there a quickstart guide or video tutorial?",
            "I accidentally skipped the configuration step. How do I go back?",
            "What permissions should I set for read-only team members?",
        ],
        "default": [
            "Hello, I need help with something.",
            "Can you explain how this works?",
            "I'm having an issue with the system.",
            "What options are available to me?",
            "I'd like to request a new feature.",
            "Something seems broken. Can you check?",
            "How do I get started with the advanced features?",
            "I have a question about my account.",
            "Can you walk me through the process?",
            "I need this resolved as soon as possible.",
        ],
    }

    _COMPLEXITY_MODIFIERS: list[str] = [
        "",  # baseline
        " Also, I'm in a hurry.",
        " I've already tried the usual troubleshooting steps.",
        " This is blocking my entire team.",
        " I need this resolved before our board meeting tomorrow.",
        " I'm considering switching to a competitor if this isn't fixed.",
        " Multiple people on my team are experiencing this.",
        " This worked fine yesterday. Something changed on your end.",
        " I've attached screenshots but they might not have come through.",
        " This is the third time I've reported this issue.",
    ]

    _FILL_VALUES: dict[str, list[str]] = {
        "order_id": ["48291", "77103", "91456", "33087", "62514"],
        "team_size": ["15", "50", "200", "500", "1000"],
        "competitor": ["Competitor A", "Acme Corp", "DataFlow", "Zenith AI", "NovaTech"],
        "volume": ["1000", "10000", "50000", "100000", "500000"],
        "system": ["Salesforce", "Slack", "Jira", "AWS", "Azure"],
        "code_snippet": ["def process(data): return [x for x in data if x.valid()]"],
        "ci_output": ["Error: eslint found 3 problems (2 errors, 1 warning)"],
        "user_id": ["1; DROP TABLE users--", "admin' OR '1'='1", "42"],
        "auth_flow": ["OAuth2 PKCE with refresh token rotation"],
        "previous_tool": ["Notion", "Trello", "Asana", "Monday.com", "Airtable"],
    }

    def generate_input(
        self,
        scenario: str,
        round_num: int,
        total_rounds: int,
    ) -> dict:
        """Generate a synthetic user input for the given round.

        Inputs increase in complexity as rounds progress.
        """
        # Determine which template set to use.
        templates = self._match_templates(scenario)

        # Pick a message -- cycle through templates, varying by round.
        idx = round_num % len(templates)
        message = templates[idx]

        # Fill in template variables.
        message = self._fill_template(message)

        # Add complexity modifier based on round progression.
        progress = round_num / max(total_rounds - 1, 1)
        if progress > 0.3:
            modifier_idx = min(
                int(progress * len(self._COMPLEXITY_MODIFIERS)),
                len(self._COMPLEXITY_MODIFIERS) - 1,
            )
            message += self._COMPLEXITY_MODIFIERS[modifier_idx]

        # Inject edge cases in later rounds.
        edge_case = None
        if progress > 0.7:
            edge_case = random.choice([
                "conflicting_information",
                "emotional_escalation",
                "ambiguous_request",
                "multi_topic",
                "language_barrier",
            ])
            edge_modifiers = {
                "conflicting_information": " Actually, wait -- I think I gave you the wrong details earlier.",
                "emotional_escalation": " I'm really frustrated and considering leaving a public review.",
                "ambiguous_request": " Also, can you help with the other thing we discussed?",
                "multi_topic": " Oh, and I also have a billing question while I have you.",
                "language_barrier": " Sorry, English is not my first language. Let me try to explain differently.",
            }
            message += edge_modifiers.get(edge_case, "")

        return {
            "user_message": message,
            "context": f"Scenario: {scenario} | Round {round_num + 1}/{total_rounds}",
            "round": round_num,
            "metadata": {
                "complexity": round(progress, 2),
                "edge_case": edge_case,
                "scenario_topic": self._detect_topic(scenario),
            },
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _match_templates(self, scenario: str) -> list[str]:
        scenario_lower = scenario.lower()
        for topic, templates in self._TEMPLATES.items():
            if topic != "default" and topic in scenario_lower:
                return templates
        # Check for partial matches.
        if any(w in scenario_lower for w in ("help", "assist", "customer", "ticket")):
            return self._TEMPLATES["support"]
        if any(w in scenario_lower for w in ("sell", "pricing", "deal", "pipeline")):
            return self._TEMPLATES["sales"]
        if any(w in scenario_lower for w in ("review", "code", "pr", "lint", "test")):
            return self._TEMPLATES["code"]
        if any(w in scenario_lower for w in ("onboard", "setup", "start", "welcome")):
            return self._TEMPLATES["onboarding"]
        return self._TEMPLATES["default"]

    def _fill_template(self, message: str) -> str:
        for key, values in self._FILL_VALUES.items():
            placeholder = "{" + key + "}"
            if placeholder in message:
                message = message.replace(placeholder, random.choice(values))
        return message

    @staticmethod
    def _detect_topic(scenario: str) -> str:
        s = scenario.lower()
        if any(w in s for w in ("support", "help", "customer", "ticket")):
            return "support"
        if any(w in s for w in ("sales", "sell", "pricing", "deal")):
            return "sales"
        if any(w in s for w in ("code", "review", "pr", "lint")):
            return "code_review"
        if any(w in s for w in ("onboard", "setup", "start")):
            return "onboarding"
        return "general"
