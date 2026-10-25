"""
LiveKit function tools for the production HR & Technical interview agent.
Tools available to the agent during interviews:
  1. search_project_docs   — RAG search over project documentation
  2. search_candidate_resume — RAG search over uploaded resume
  3. search_web_info       — Real-time web search (DuckDuckGo, no API key needed)
  4. generate_feedback     — Generate structured end-of-interview feedback
"""

import logging

from livekit.agents import RunContext, function_tool

try:
    from backend.rag import query_rag, query_resume_rag
    from backend.web_scraper import search_and_summarise, web_search
except ImportError:
    from rag import query_rag, query_resume_rag  # type: ignore
    from web_scraper import search_and_summarise, web_search  # type: ignore

logger = logging.getLogger(__name__)


@function_tool
async def search_project_docs(
    context: RunContext,
    query: str,
) -> str:
    """
    Search the candidate's project documentation for technical details,
    architecture decisions, implementation choices, and design rationale.

    Use this BEFORE asking about any specific project feature, technology,
    or architectural decision to ground your questions in real facts.

    Args:
        query: What to search for (e.g. "database schema", "API authentication",
               "deployment infrastructure", "caching strategy")

    Returns:
        Relevant excerpts from the project documentation
    """
    logger.info(f"[Tool] search_project_docs: {query!r}")
    try:
        result = query_rag(query, k=4)
        if not result or len(result.strip()) < 20:
            return f"No relevant project documentation found for: {query}"
        return result
    except Exception as e:
        logger.error(f"search_project_docs error: {e}")
        return f"Could not search project docs: {e}"


@function_tool
async def search_candidate_resume(
    context: RunContext,
    query: str,
) -> str:
    """
    Search the candidate's uploaded resume for background information,
    work history, technical skills, education, certifications, and
    previous projects.

    Use this at the START of the interview and whenever you want to
    personalise a question using the candidate's actual experience.

    Args:
        query: What to look up (e.g. "work experience", "education",
               "Python skills", "past companies", "certifications")

    Returns:
        Relevant sections from the candidate's resume, or a message
        if no resume has been uploaded yet.
    """
    logger.info(f"[Tool] search_candidate_resume: {query!r}")
    try:
        result = query_resume_rag(query, k=4)
        return result
    except Exception as e:
        logger.error(f"search_candidate_resume error: {e}")
        return f"Could not search resume: {e}"


@function_tool
async def search_web_info(
    context: RunContext,
    query: str,
) -> str:
    """
    Search the web in real time for current information about technologies,
    companies, industry trends, best practices, or anything else relevant
    to the interview.

    Use this to:
    - Research a technology the candidate mentioned ("Redis pub/sub use cases")
    - Look up a company they worked at ("Infosys tech stack")
    - Find current best practices ("FastAPI production deployment 2024")
    - Get industry context ("microservices vs monolith trade-offs 2024")
    - Verify technical claims ("Kubernetes autoscaling best practices")

    Args:
        query: Web search query (be specific for best results)

    Returns:
        Summarised search results from the web
    """
    logger.info(f"[Tool] search_web_info: {query!r}")
    try:
        # Use enhanced search for deeper context
        result = search_and_summarise(query, max_results=3)
        if not result or "No results" in result:
            # Fallback to basic search
            result = web_search(query, max_results=4)
        return result
    except Exception as e:
        logger.error(f"search_web_info error: {e}")
        # Final fallback
        try:
            return web_search(query, max_results=3)
        except Exception as e2:
            return f"Web search unavailable: {e2}"


@function_tool
async def generate_feedback(
    context: RunContext,
    strengths: str,
    areas_for_improvement: str,
    overall_rating: int,
) -> str:
    """
    Generate a structured interview feedback report at the END of the interview.
    
    Only call this AFTER completing all interview phases (HR, behavioral,
    technical, and system design). Do not call this mid-interview.

    Args:
        strengths: 3-5 specific strengths observed during the interview,
                   with concrete examples from their answers
        areas_for_improvement: 3-5 specific areas where the candidate
                                needs growth, with concrete examples
        overall_rating: Overall rating from 1-10 (10 = exceptional hire,
                        7-9 = strong candidate, 5-6 = marginal, 1-4 = not ready)

    Returns:
        Formatted feedback report read aloud to the candidate
    """
    logger.info(f"[Tool] generate_feedback: rating={overall_rating}")

    rating_label = {
        10: "Exceptional — Strong Hire",
        9:  "Outstanding — Hire",
        8:  "Strong — Hire",
        7:  "Good — Lean Hire",
        6:  "Mixed — Borderline",
        5:  "Marginal — Lean No Hire",
        4:  "Weak — No Hire",
        3:  "Not Ready — No Hire",
        2:  "Significantly Underprepared — No Hire",
        1:  "Not a Fit — No Hire",
    }.get(overall_rating, f"Rating {overall_rating}/10")

    feedback = f"""
Thank you for your time today. Here is my feedback from our interview.

Overall rating: {overall_rating} out of 10 — {rating_label}.

Your key strengths:
{strengths}

Areas to focus on for growth:
{areas_for_improvement}

{"I would be happy to recommend you moving forward in the process." if overall_rating >= 7 else "I encourage you to continue developing in the areas mentioned and apply again in the future."}

Thank you again for the conversation today. Do you have any final questions for me?
""".strip()

    return feedback
