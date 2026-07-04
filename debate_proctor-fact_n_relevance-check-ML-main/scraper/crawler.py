import wikipediaapi
from config import USER_AGENT, MAX_DEPTH

# Initialize the API wrapper
wiki_wiki = wikipediaapi.Wikipedia(
    user_agent=USER_AGENT,
    language='en'
)

def extract_page_data(page_obj):
    """Converts a Wiki Page Object into a clean dictionary."""
    return {
        "pageid": page_obj.pageid,
        "title": page_obj.title,
        "url": page_obj.fullurl,
        "content": page_obj.text, # Takes full text
        "categories": list(page_obj.categories.keys())
    }

def fetch_category_pages(category_name, level=0, _seen_pageids=None, _seen_categories=None):
    """
    Generator that yields page data from a category.
    Handles recursion based on MAX_DEPTH.
    
    De-duplicates pages and categories within a single run so a page that
    lives in multiple categories is only fetched once, and a category cycle
    cannot cause infinite recursion.
    """
    # Initialize the run-scoped dedup sets on the top-level call.
    # Recursive calls pass them through.
    if _seen_pageids is None:
        _seen_pageids = set()
    if _seen_categories is None:
        _seen_categories = set()
    
    # Skip categories we've already scanned in this run (cycle guard)
    if category_name in _seen_categories:
        return
    _seen_categories.add(category_name)
    
    cat_page = wiki_wiki.page(category_name)
    
    if not cat_page.exists():
        print(f"   ⚠️ Category '{category_name}' not found.")
        return

    print(f"📂 Scanning Category: {category_name} (Level {level})")

    for member in cat_page.categorymembers.values():
        
        # Case 1: It's an Article
        if member.ns == wikipediaapi.Namespace.MAIN:
            # Skip if we've already yielded this page in this run
            if member.pageid in _seen_pageids:
                continue
            _seen_pageids.add(member.pageid)
            yield extract_page_data(member)
        
        # Case 2: It's a Subcategory (Recursion)
        elif member.ns == wikipediaapi.Namespace.CATEGORY and level < MAX_DEPTH:
            yield from fetch_category_pages(
                member.title,
                level + 1,
                _seen_pageids=_seen_pageids,
                _seen_categories=_seen_categories,
            )
