"""
RAG (Retrieval Augmented Generation) module for project documentation.
Handles document ingestion, chunking, and retrieval from vector store.
Now uses Google Generative AI (Gemini) embeddings instead of OpenAI.
"""

import os
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


# Paths — Project documentation
DATA_DIR = Path(__file__).parent / "data"
PDF_PATH = DATA_DIR / "project_doc_long.pdf"
CHROMA_DB_PATH = DATA_DIR / "chroma_db"

# Paths — Resume
RESUME_PDF_PATH = DATA_DIR / "resume.pdf"
RESUME_TEXT_PATH = DATA_DIR / "resume_text.txt"
RESUME_CHROMA_DB_PATH = DATA_DIR / "resume_chroma_db"


def load_and_chunk_documents(
    pdf_path: Path = PDF_PATH,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[Document]:
    """
    Load PDF and split into chunks.
    
    Args:
        pdf_path: Path to PDF file
        chunk_size: Size of each text chunk
        chunk_overlap: Overlap between chunks for context continuity
    
    Returns:
        List of Document chunks
    """
    # Load PDF
    loader = PyPDFLoader(str(pdf_path))
    documents = loader.load()
    
    # Split into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks = text_splitter.split_documents(documents)
    
    return chunks


def ingest_documents(
    pdf_path: Path = PDF_PATH,
    persist_directory: Path = CHROMA_DB_PATH,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    batch_size: int = 50,
) -> Chroma:
    """
    Ingest documents into ChromaDB vector store using Gemini embeddings.
    Uses batched ingestion to respect Gemini free-tier rate limits
    (100 embed requests/minute).

    Args:
        pdf_path: Path to PDF file
        persist_directory: Where to persist the vector DB
        chunk_size: Size of each text chunk
        chunk_overlap: Overlap between chunks
        batch_size: Chunks per batch (default 80, safely under 100 req/min limit)

    Returns:
        Chroma vector store instance
    """
    import time

    # Ensure GOOGLE_API_KEY is set
    if not os.getenv("GOOGLE_API_KEY"):
        raise ValueError(
            "GOOGLE_API_KEY environment variable must be set for Gemini embeddings"
        )

    # Load and chunk documents
    chunks = load_and_chunk_documents(pdf_path, chunk_size, chunk_overlap)

    print(f"Split {len(set(doc.metadata.get('source') for doc in chunks))} documents into {len(chunks)} chunks")

    # Create Google Generative AI embeddings (gemini-embedding-001)
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )

    # Batch ingestion to respect free-tier rate limits (100 req/min)
    vectorstore = None
    total_batches = (len(chunks) + batch_size - 1) // batch_size

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        batch_num = (i // batch_size) + 1
        print(f"  Embedding batch {batch_num}/{total_batches} ({len(batch)} chunks)...", flush=True)

        if vectorstore is None:
            # First batch: create the store
            vectorstore = Chroma.from_documents(
                documents=batch,
                embedding=embeddings,
                persist_directory=str(persist_directory),
            )
        else:
            # Subsequent batches: add to existing store
            vectorstore.add_documents(batch)

        # Respect rate limit: wait 65s between batches (free tier = 100 req/min)
        if i + batch_size < len(chunks):
            print(f"  ⏳ Rate limit pause (65s)...", flush=True)
            time.sleep(65)

    print(f"Stored {len(chunks)} chunks in Chroma at {persist_directory}")
    return vectorstore



def get_retriever(
    persist_directory: Path = CHROMA_DB_PATH,
    k: int = 4,
):
    """
    Get retriever from existing ChromaDB.
    
    Args:
        persist_directory: Path to ChromaDB
        k: Number of documents to retrieve
    
    Returns:
        Retriever instance
    """
    if not persist_directory.exists():
        raise FileNotFoundError(
            f"ChromaDB not found at {persist_directory}. Run ingest.py first."
        )
    
    # Ensure GOOGLE_API_KEY is set
    if not os.getenv("GOOGLE_API_KEY"):
        raise ValueError(
            "GOOGLE_API_KEY environment variable must be set for Gemini embeddings"
        )
    
    # Create Google Generative AI embeddings (gemini-embedding-001)
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )
    
    vectorstore = Chroma(
        persist_directory=str(persist_directory),
        embedding_function=embeddings,
    )
    
    return vectorstore.as_retriever(search_kwargs={"k": k})


def deduplicate_documents(docs: List[Document]) -> List[Document]:
    """
    Remove duplicate documents from retrieval results.
    
    Uses content fingerprinting to identify exact and near-exact duplicates
    caused by chunk overlap. Fast and effective for RAG retrieval.
    
    Args:
        docs: List of retrieved Document objects
    
    Returns:
        List of unique documents (order preserved)
    """
    seen = set()
    unique_docs = []
    
    for doc in docs:
        # Use first 150 chars as fingerprint (covers most overlap cases)
        # Normalize whitespace for better matching
        fingerprint = " ".join(doc.page_content[:150].strip().split())
        
        if fingerprint not in seen:
            seen.add(fingerprint)
            unique_docs.append(doc)
    
    return unique_docs


def query_rag(query: str, k: int = 4, deduplicate: bool = True) -> str:
    """
    Query the RAG system and return relevant context.
    
    Args:
        query: Question or search query
        k: Number of unique documents to retrieve
        deduplicate: Whether to remove duplicate chunks (default: True)
    
    Returns:
        Concatenated relevant document chunks
    """
    # Load environment variables if not already loaded
    from dotenv import load_dotenv
    env_path = Path(__file__).parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
    
    # Retrieve more if deduplicating (to ensure we get k unique chunks)
    retrieve_k = int(k * 1.5) if deduplicate else k
    retriever = get_retriever(k=retrieve_k)
    docs = retriever.invoke(query)
    
    # Deduplicate if enabled
    if deduplicate:
        docs = deduplicate_documents(docs)
        # Take top k after deduplication
        docs = docs[:k]
    
    # Concatenate retrieved documents
    context = "\n\n---\n\n".join([doc.page_content for doc in docs])
    
    return context


# ─────────────────────────────────────────────────────────────────────────────
# RESUME RAG — separate ChromaDB collection for candidate resume
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_docx(docx_path: Path) -> str:
    """Extract text from a DOCX file using standard library zipfile and XML parsing."""
    import zipfile
    import xml.etree.ElementTree as ET
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read("word/document.xml")
        tree = ET.fromstring(xml_content)
        texts = [node.text for node in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if node.text]
        return "\n".join(texts).strip()
    except Exception as e:
        print(f"Error parsing DOCX: {e}")
        return ""


def ingest_resume(
    pdf_path: Path = RESUME_PDF_PATH,
    persist_directory: Path = RESUME_CHROMA_DB_PATH,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> Chroma:
    """
    Ingest a candidate's resume (PDF or DOCX) into a dedicated ChromaDB collection.
    Also extracts and saves full raw resume text for prompt grounding.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"Resume file not found at {pdf_path}")

    if not os.getenv("GOOGLE_API_KEY"):
        raise ValueError("GOOGLE_API_KEY environment variable must be set")

    # Load and save full text
    full_text = ""
    is_docx = str(pdf_path).lower().endswith(".docx")
    if is_docx:
        full_text = extract_text_from_docx(pdf_path)
    else:
        try:
            loader = PyPDFLoader(str(pdf_path))
            raw_docs = loader.load()
            full_text = "\n\n".join([doc.page_content for doc in raw_docs])
        except Exception as e:
            print(f"Warning: PDF load error: {e}")

    if full_text:
        RESUME_TEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
        RESUME_TEXT_PATH.write_text(full_text, encoding="utf-8")
        print(f"Resume text saved: {len(full_text)} characters -> {RESUME_TEXT_PATH}")

    if is_docx:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
        )
        chunks = text_splitter.create_documents([full_text])
    else:
        chunks = load_and_chunk_documents(pdf_path, chunk_size, chunk_overlap)
    print(f"Resume: split into {len(chunks)} chunks")

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(persist_directory),
    )

    print(f"Resume ingested: {len(chunks)} chunks -> {persist_directory}")
    return vectorstore


def get_resume_full_text() -> str:
    """
    Get full extracted text of candidate's resume.
    If text file does not exist but PDF exists, extracts it on the fly.
    """
    if RESUME_TEXT_PATH.exists():
        try:
            return RESUME_TEXT_PATH.read_text(encoding="utf-8").strip()
        except Exception:
            pass

    if RESUME_PDF_PATH.exists():
        try:
            loader = PyPDFLoader(str(RESUME_PDF_PATH))
            docs = loader.load()
            text = "\n\n".join([doc.page_content for doc in docs]).strip()
            if text:
                RESUME_TEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
                RESUME_TEXT_PATH.write_text(text, encoding="utf-8")
                return text
        except Exception as e:
            print(f"Warning: Failed to extract resume text on the fly: {e}")

    return ""


def extract_candidate_name(resume_text: str) -> str:
    """Extract candidate first name or full name from resume text."""
    if not resume_text:
        return ""
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    if not lines:
        return ""
    # Usually first line is candidate name
    first_line = lines[0]
    # Strip any special symbols/icons
    cleaned = "".join(c for c in first_line if c.isalpha() or c.isspace()).strip()
    words = cleaned.split()
    if words and len(words[0]) > 1:
        return words[0]  # First name
    return ""


def get_resume_retriever(
    persist_directory: Path = RESUME_CHROMA_DB_PATH,
    k: int = 4,
):
    """Get retriever from the resume ChromaDB. Returns None if no resume ingested."""
    if not persist_directory.exists():
        return None
    if not os.getenv("GOOGLE_API_KEY"):
        return None

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )

    vectorstore = Chroma(
        persist_directory=str(persist_directory),
        embedding_function=embeddings,
    )
    return vectorstore.as_retriever(search_kwargs={"k": k})


def query_resume_rag(query: str, k: int = 4) -> str:
    """
    Query the candidate's resume for relevant information.
    Returns helpful message if no resume has been uploaded.
    """
    from dotenv import load_dotenv
    env_path = Path(__file__).parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()

    retriever = get_resume_retriever(k=k)

    if retriever is None:
        return "No resume has been uploaded for this candidate yet."

    try:
        docs = retriever.invoke(query)
        docs = deduplicate_documents(docs)[:k]
        if not docs:
            return "No relevant information found in the candidate's resume."
        return "\n\n---\n\n".join([doc.page_content for doc in docs])
    except Exception as e:
        return f"Error querying resume: {e}"
