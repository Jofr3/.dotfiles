# Browser MCP Development Skill

## Overview

This skill enables comprehensive browser-based development and debugging workflows through the Browser MCP integration. Browser MCP provides direct browser control for real-time web development, allowing you to navigate, inspect, debug, and optimize web applications as you code.

Use this skill when you need to:
- Develop and test web applications in real-time
- Debug frontend issues with live inspection
- Monitor console logs and network requests
- Inspect and manipulate DOM elements
- Test responsive designs across viewports
- Analyze performance and resource loading
- Validate functionality during development
- Capture visual evidence of bugs or behaviors

## Core Capabilities

### Browser Control & Navigation
- **Page Navigation**: Visit URLs, reload pages, navigate history
- **Tab Management**: Open, close, and switch between browser tabs
- **Development Server Integration**: Connect to local dev servers (localhost:3000, etc.)
- **Auto-refresh Workflows**: Reload pages after code changes
- **Multi-environment Testing**: Manage tabs for dev/staging/production simultaneously

### Console Monitoring & Debugging
- **Console Log Reading**: Capture logs, warnings, errors, and info messages
- **JavaScript Execution**: Evaluate expressions in browser console context
- **Error Stack Traces**: Capture and analyze JavaScript errors
- **Console Filtering**: Focus on specific log types or patterns
- **Real-time Monitoring**: Watch console output during development
- **Expression Evaluation**: Test JavaScript snippets in page context

### DOM Inspection & Manipulation
- **Element Querying**: Select elements via CSS selectors, XPath, or text
- **Property Inspection**: Examine element attributes, styles, and computed values
- **DOM Modification**: Modify elements for testing (attributes, content, styles)
- **Structure Analysis**: Traverse DOM tree and understand hierarchy
- **State Validation**: Check element visibility, classes, data attributes
- **Event Debugging**: Inspect event listeners and handlers

### Network Analysis & Monitoring
- **Request Tracking**: Monitor all HTTP requests (XHR, Fetch, resources)
- **Response Inspection**: Analyze status codes, headers, and response bodies
- **API Endpoint Testing**: Verify API calls and responses
- **Failed Request Detection**: Identify and debug network errors
- **Performance Analysis**: Measure request/response times
- **Resource Loading**: Track CSS, JS, images, fonts loading

### Visual Capture & Documentation
- **Screenshots**: Capture full page, viewport, or specific elements
- **Visual Bug Reports**: Document issues with annotated screenshots
- **Before/After Comparisons**: Capture state changes
- **Responsive Testing**: Screenshot different viewport sizes
- **Error Documentation**: Visual evidence of bugs

### Performance Debugging & Optimization
- **Page Load Timing**: Measure and analyze load performance
- **Resource Loading Patterns**: Identify slow or blocking resources
- **Memory Leak Detection**: Monitor memory usage over time
- **Runtime Performance**: Analyze JavaScript execution time
- **Rendering Performance**: Identify layout thrashing and reflows
- **Bundle Analysis**: Check loaded scripts and their sizes

## Best Practices

### Development Workflow Integration

1. **Start with browser opened**: Keep browser MCP connected during development
   ```
   Open browser → Navigate to localhost → Watch console → Code → Refresh → Validate
   ```

2. **Use dedicated development profile**: Separate debugging from personal browsing
   - Disable extensions that might interfere
   - Enable verbose logging and DevTools features
   - Configure appropriate viewport for development

3. **Monitor console continuously**: Watch for errors/warnings as you code
   - Keep console visible during development
   - Address warnings before they become errors
   - Use console.log strategically for debugging

4. **Test incrementally**: Validate small changes immediately
   - Make small code change → Refresh → Check console → Verify behavior
   - Don't accumulate many changes before testing
   - Fix issues as they appear

### Console Monitoring Strategy

**Log Level Priorities**:
- **Errors**: Stop and fix immediately (red alerts)
- **Warnings**: Address before committing (yellow alerts)
- **Info**: Useful development feedback
- **Debug**: Detailed troubleshooting information

**Effective Console Usage**:
```javascript
// Structure console logs for easy filtering
console.log('[AUTH]:', 'User logged in', userData);
console.error('[API]:', 'Failed to fetch', error);
console.warn('[DEPRECATED]:', 'Old function usage');

// Use groups for related operations
console.group('User Registration Flow');
console.log('Step 1: Validate input');
console.log('Step 2: Call API');
console.groupEnd();
```

### DOM Inspection Techniques

**Selector Hierarchy** (use in this order):
1. **data-testid attributes**: Most reliable for automation
   ```css
   [data-testid="submit-button"]
   ```

2. **ID selectors**: Unique identifiers
   ```css
   #user-profile
   ```

3. **Semantic classes**: Meaningful, stable class names
   ```css
   .header-navigation
   ```

4. **Element + Class combinations**: More specific
   ```css
   button.primary-action
   ```

5. **Avoid**: Deeply nested selectors, nth-child, generated classes
   ```css
   /* Bad: .css-1234abc div:nth-child(3) span */
   ```

**Efficient DOM Queries**:
- Start broad, then narrow if multiple matches found
- Use `querySelector` for single elements
- Use `querySelectorAll` for multiple elements
- Cache selectors in variables when reusing

### Network Debugging Workflow

1. **Before making changes**:
   - Clear network log
   - Start monitoring requests
   - Note baseline request count

2. **During testing**:
   - Watch for unexpected requests
   - Check status codes (200s OK, 400s client errors, 500s server errors)
   - Verify request/response payloads
   - Monitor timing (slow endpoints)

3. **After validation**:
   - Ensure all required requests succeeded
   - No unnecessary/duplicate requests
   - Acceptable performance timing
   - Proper error handling for failures

### Performance Optimization Approach

**Measurement First**:
- Always measure before optimizing
- Establish baseline metrics
- Use objective numbers, not subjective "feels slow"

**Key Metrics to Track**:
- Time to First Byte (TTFB): Server response time
- First Contentful Paint (FCP): First visual render
- Largest Contentful Paint (LCP): Main content loaded
- Time to Interactive (TTI): Page becomes interactive
- Total Blocking Time (TBT): Main thread blocking

**Optimization Priority**:
1. Fix errors and warnings first
2. Reduce bundle size (lazy loading, code splitting)
3. Optimize images and assets
4. Minimize render-blocking resources
5. Optimize JavaScript execution
6. Reduce memory usage

### Screenshot and Documentation

**When to Capture Screenshots**:
- Bug discovery (document current broken state)
- Feature completion (show working implementation)
- Responsive testing (different viewports)
- Visual regression (before/after changes)
- User reports (reproduce reported issues)

**Screenshot Best Practices**:
- Full page for layout issues
- Viewport for specific component issues
- Element-specific for focused debugging
- Include console/network panels when relevant
- Name files descriptively (bug-login-form-2024-12-12.png)

## Common Workflows

### Workflow 1: Local Development Testing

**Scenario**: Developing a React/Vue/Svelte app locally

1. **Initial Setup**
   ```
   → Open browser
   → Navigate to http://localhost:3000 (or your dev server port)
   → Open console monitoring
   → Verify no initial errors
   ```

2. **Development Cycle**
   ```
   → Make code changes in editor
   → Save files (dev server auto-reloads)
   → Check console for errors/warnings
   → Verify visual changes in browser
   → Test functionality (clicks, forms, navigation)
   → Repeat
   ```

3. **When Issues Arise**
   ```
   → Check console for error messages
   → Inspect DOM to verify structure
   → Check network tab for failed requests
   → Evaluate expressions to test hypotheses
   → Screenshot if needed for documentation
   → Fix code and verify resolution
   ```

### Workflow 2: Debugging JavaScript Errors

**Scenario**: Application throwing runtime errors

1. **Identify Error**
   ```
   → Monitor console for error messages
   → Read error message and stack trace
   → Note the file, line, and column number
   → Identify error type (TypeError, ReferenceError, etc.)
   ```

2. **Investigate Context**
   ```
   → Evaluate expressions around error point
   → Check variable values: console.log(variableName)
   → Verify function availability: typeof functionName
   → Inspect element state if DOM-related
   → Check network for data loading issues
   ```

3. **Test Hypothesis**
   ```
   → Try fixes in console first (evaluate expressions)
   → Test edge cases
   → Verify assumptions
   → Document root cause
   ```

4. **Implement Fix**
   ```
   → Make code changes
   → Refresh page
   → Verify error is gone
   → Test related functionality
   → Check for new errors introduced
   ```

### Workflow 3: API Integration Debugging

**Scenario**: Frontend not working with API correctly

1. **Monitor Network Requests**
   ```
   → Clear network log
   → Trigger API call (button click, page load)
   → Identify API request in network log
   → Check request details:
     - Method (GET, POST, etc.)
     - URL and parameters
     - Headers (auth tokens, content-type)
     - Request body/payload
   ```

2. **Analyze Response**
   ```
   → Check status code
     - 200-299: Success
     - 400-499: Client error (bad request, unauthorized, not found)
     - 500-599: Server error
   → Inspect response body
   → Verify response format (JSON, HTML, etc.)
   → Check response headers
   ```

3. **Debug Issues**
   ```
   → If 400s: Check request payload, auth headers
   → If 500s: Check server logs, contact backend team
   → If CORS error: Verify server allows origin
   → If timeout: Check network, server performance
   → If parsing error: Verify response format matches expectations
   ```

4. **Validate Fix**
   ```
   → Clear network log
   → Retry request
   → Verify successful response
   → Check console for parsing errors
   → Verify data displays correctly in UI
   ```

### Workflow 4: Responsive Design Testing

**Scenario**: Ensuring site works across different screen sizes

1. **Setup Test Viewports**
   ```
   Common breakpoints to test:
   - Mobile: 375x667 (iPhone), 360x640 (Android)
   - Tablet: 768x1024 (iPad), 1024x768 (iPad landscape)
   - Desktop: 1366x768, 1920x1080
   - Wide: 2560x1440
   ```

2. **Test Each Viewport**
   ```
   For each viewport size:
   → Resize browser or set viewport
   → Refresh page
   → Screenshot full page
   → Check layout integrity
   → Test navigation menu (mobile hamburger, etc.)
   → Verify content readability
   → Test interactive elements (buttons, forms)
   → Check for horizontal scrollbars (usually bad)
   ```

3. **Common Issues to Check**
   ```
   → Text overflow or truncation
   → Images not scaling properly
   → Overlapping elements
   → Inaccessible controls (too small, off-screen)
   → Broken layouts (grid/flexbox issues)
   → Hidden content that should be visible
   ```

4. **Document Findings**
   ```
   → Screenshot issues at specific breakpoints
   → Note exact viewport dimensions where issues occur
   → Describe expected vs. actual behavior
   → Prioritize fixes (broken > suboptimal)
   ```

### Workflow 5: Performance Investigation

**Scenario**: Page feels slow or unresponsive

1. **Establish Baseline**
   ```
   → Clear cache and reload
   → Measure load time (start to fully loaded)
   → Check console for performance warnings
   → Note subjective experience (when does it feel usable?)
   ```

2. **Analyze Network Performance**
   ```
   → Check network tab:
     - Total number of requests
     - Total transfer size
     - Time to complete
   → Identify slow requests (>1s)
   → Check for failed requests
   → Look for duplicate requests
   → Verify compression (gzip/brotli)
   ```

3. **Analyze Resource Loading**
   ```
   → Large JavaScript bundles (>500KB is concerning)
   → Unoptimized images (>1MB per image)
   → Render-blocking resources
   → Unnecessary third-party scripts
   → Missing lazy loading
   ```

4. **Analyze Runtime Performance**
   ```
   → Check console for performance.now() timing
   → Evaluate: performance.getEntriesByType('navigation')[0]
   → Look for long-running scripts
   → Check memory usage: performance.memory
   → Identify memory leaks (usage grows over time)
   ```

5. **Test Improvements**
   ```
   → Implement optimization (code splitting, lazy loading, etc.)
   → Clear cache
   → Measure again
   → Compare before/after metrics
   → Verify no functionality broken
   ```

### Workflow 6: Form Validation Testing

**Scenario**: Testing form submission and validation

1. **Test Happy Path**
   ```
   → Fill form with valid data
   → Submit form
   → Check console for errors
   → Verify network request sent
   → Check response (success message, redirect)
   → Verify data displayed correctly
   ```

2. **Test Validation Rules**
   ```
   For each field:
   → Leave empty (if required)
   → Enter invalid format (wrong email, etc.)
   → Enter too short/long values
   → Try special characters
   → Submit and verify error messages
   → Check error messages are clear and helpful
   ```

3. **Test Edge Cases**
   ```
   → Submit empty form
   → Submit while previous request pending
   → Submit with JavaScript disabled (if applicable)
   → Test browser back/forward with filled form
   → Test form with autofill data
   → Test copy/paste into fields
   ```

4. **Test Error Handling**
   ```
   → Simulate network failure (offline mode)
   → Test server error response (500)
   → Test validation error response (400)
   → Verify error messages display
   → Verify form doesn't reset on error
   → Verify retry functionality
   ```

## Tool Usage Patterns

### Browser Control Commands

**Navigation**:
```
# Open browser and navigate
→ Navigate to URL: https://example.com
→ Navigate to local dev: http://localhost:3000

# Reload page (after code changes)
→ Reload page
→ Hard reload (bypass cache)

# Navigation
→ Go back
→ Go forward
```

**Tab Management**:
```
# Multiple environments
→ Open tab: http://localhost:3000 (dev)
→ Open tab: https://staging.example.com (staging)
→ Open tab: https://example.com (production)

# Switch between tabs
→ Switch to tab [index or title]
→ Close tab [index or title]
```

### Console Operations

**Reading Console Output**:
```
# Get all console messages
→ Read console logs

# Filter by level
→ Read console errors only
→ Read console warnings only

# Real-time monitoring
→ Start console monitoring
→ Perform action (click, submit, etc.)
→ Check captured console output
→ Stop monitoring
```

**Evaluating JavaScript**:
```
# Test expression
→ Evaluate: document.title
→ Evaluate: window.location.href

# Check variable
→ Evaluate: typeof myVariable
→ Evaluate: myVariable !== undefined

# Test function
→ Evaluate: myFunction('test')

# Complex expressions
→ Evaluate: Array.from(document.querySelectorAll('.item')).map(el => el.textContent)

# Check state
→ Evaluate: localStorage.getItem('authToken')
→ Evaluate: document.querySelector('#app').__vue__ // Vue instance
```

### DOM Inspection

**Query Elements**:
```
# Single element
→ Query selector: #main-nav
→ Query selector: .header-button
→ Query selector: [data-testid="submit"]

# Multiple elements
→ Query all: .item
→ Query all: button[type="submit"]

# By text content
→ Find element by text: "Login"
→ Find element by text: "Submit Form"
```

**Inspect Properties**:
```
# Element attributes
→ Get attribute: id
→ Get attribute: class
→ Get attribute: data-testid

# Computed styles
→ Get computed style: color
→ Get computed style: display
→ Get computed style: font-size

# Element state
→ Check visibility
→ Check if element exists
→ Get element text content
→ Get element HTML
```

**Modify Elements** (for testing):
```
# Change attributes
→ Set attribute: data-test="true"
→ Remove attribute: disabled

# Modify styles
→ Set style: display="none"
→ Set style: background-color="yellow"

# Change content
→ Set text content: "Updated Text"
→ Set HTML: "<span>New HTML</span>"

# Trigger events
→ Click element
→ Focus element
→ Dispatch event: "change"
```

### Network Monitoring

**Request Tracking**:
```
# Start monitoring before action
→ Clear network log
→ Start network monitoring
→ Perform action (click button, navigate, etc.)
→ Get network requests

# Filter requests
→ Get failed requests
→ Get requests by URL pattern: "/api/"
→ Get requests by status code: 500
```

**Request Analysis**:
```
# Inspect specific request
→ Get request details: [request URL or index]
→ Get request headers
→ Get request payload
→ Get response body
→ Get response headers
→ Get response status code
```

**Performance Timing**:
```
# Measure request duration
→ Get request timing
→ Get all request timings
→ Sort by duration (find slowest)
```

### Screenshots

**Capture Types**:
```
# Full page screenshot
→ Screenshot: full page

# Viewport (visible area)
→ Screenshot: viewport

# Specific element
→ Screenshot: element selector .main-content

# With DevTools visible
→ Screenshot: with console
→ Screenshot: with network panel
```

**Screenshot Usage**:
```
# Bug documentation
→ Navigate to bug page
→ Screenshot with console showing error

# Before/after comparison
→ Screenshot before changes
→ Make code changes
→ Refresh
→ Screenshot after changes

# Responsive testing
→ Set viewport: 375x667
→ Screenshot
→ Set viewport: 1920x1080
→ Screenshot
```

## Examples

### Example 1: Debugging React Component Error

**Scenario**: React component throwing error on button click

```
# Step 1: Navigate to app
→ Navigate to http://localhost:3000

# Step 2: Check initial state
→ Read console logs
→ Query selector: [data-testid="problem-button"]
→ Verify element exists

# Step 3: Trigger error
→ Click element: [data-testid="problem-button"]

# Step 4: Capture error
→ Read console errors
Output: "TypeError: Cannot read property 'id' of undefined at handleClick (Component.js:42)"

# Step 5: Investigate
→ Evaluate: window.__REACT_DEVTOOLS_GLOBAL_HOOK__
→ Query selector: [data-testid="problem-button"]
→ Get attribute: data-user-id
Result: null (found the issue - missing data attribute)

# Step 6: Test fix
→ Set attribute: data-user-id="123"
→ Click element: [data-testid="problem-button"]
→ Read console logs
Result: No errors, button works

# Step 7: Implement permanent fix in code
→ Update Component.js to ensure data-user-id is set
→ Reload page
→ Click button
→ Verify no errors
```

### Example 2: API Integration Debugging

**Scenario**: Login form not working with authentication API

```
# Step 1: Setup monitoring
→ Navigate to http://localhost:3000/login
→ Clear network log
→ Start console monitoring
→ Start network monitoring

# Step 2: Attempt login
→ Query selector: #email
→ Set value: test@example.com
→ Query selector: #password
→ Set value: password123
→ Click element: [data-testid="login-button"]

# Step 3: Check network request
→ Get network requests
→ Filter: "/api/auth/login"
→ Get request details: "/api/auth/login"
Output:
  Method: POST
  Status: 400 Bad Request
  Request Body: {"email": "test@example.com", "password": "password123"}
  Response: {"error": "Missing required field: username"}

# Step 4: Identified issue - API expects "username" not "email"
→ Read console errors
Output: "Login failed: Missing required field: username"

# Step 5: Test fix in console
→ Evaluate: fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      username: 'test@example.com',
      password: 'password123'
    })
  }).then(r => r.json()).then(console.log)
Result: {success: true, token: "eyJ..."}

# Step 6: Fix code
→ Update login form to use "username" field
→ Reload page
→ Submit login form
→ Get network requests
→ Verify status: 200 OK
→ Read console logs
Result: "Login successful"
```

### Example 3: Performance Optimization

**Scenario**: Page loading slowly

```
# Step 1: Measure baseline
→ Navigate to http://localhost:3000
→ Clear network log
→ Hard reload page
→ Get network requests
→ Evaluate: performance.getEntriesByType('navigation')[0].loadEventEnd
Result: 4523ms (too slow)

# Step 2: Analyze network
→ Get network requests
→ Sort by duration
Results:
  - bundle.js: 2800ms, 1.2MB (huge!)
  - large-image.jpg: 980ms, 3.5MB (unoptimized)
  - api/data: 650ms
  - vendor.js: 420ms, 450KB

# Step 3: Check console warnings
→ Read console warnings
Output: "Warning: Large bundle detected (1.2MB). Consider code splitting."

# Step 4: Implement optimizations
→ Implement code splitting (lazy load routes)
→ Optimize image (resize, compress to 200KB)
→ Add caching headers

# Step 5: Measure improvement
→ Clear cache
→ Hard reload page
→ Get network requests
→ Evaluate: performance.getEntriesByType('navigation')[0].loadEventEnd
Result: 1456ms (3x improvement!)

# Step 6: Verify functionality still works
→ Click through main features
→ Read console logs
→ Verify no errors
→ Take screenshot: performance-improved.png
```

### Example 4: Responsive Layout Bug

**Scenario**: Mobile menu broken on tablets

```
# Step 1: Test on desktop (baseline)
→ Navigate to http://localhost:3000
→ Set viewport: 1920x1080
→ Screenshot: desktop-layout.png
→ Query selector: .desktop-menu
Result: Element found and visible

# Step 2: Test on tablet (where issue occurs)
→ Set viewport: 768x1024
→ Screenshot: tablet-layout-before.png
→ Query selector: .mobile-menu
Result: Element not found (issue confirmed!)
→ Query selector: .desktop-menu
Result: Element found but should be hidden

# Step 3: Inspect styles
→ Query selector: .desktop-menu
→ Get computed style: display
Result: "block" (should be "none" at this breakpoint)

# Step 4: Check media queries in console
→ Evaluate: window.matchMedia('(max-width: 768px)').matches
Result: true
→ Evaluate: getComputedStyle(document.querySelector('.desktop-menu')).display
Result: "block" (confirming the CSS isn't working)

# Step 5: Test fix in console
→ Set style: .desktop-menu = "display: none"
→ Query selector: .mobile-menu
→ Set style: .mobile-menu = "display: block"
→ Screenshot: tablet-layout-test-fix.png
Result: Looks correct!

# Step 6: Implement CSS fix
→ Update media queries in CSS file
→ Reload page
→ Screenshot: tablet-layout-fixed.png
→ Verify mobile menu appears
→ Test at other breakpoints: 375px, 1024px, 1366px
→ All working correctly
```

### Example 5: Memory Leak Detection

**Scenario**: Application slowing down over time

```
# Step 1: Establish baseline
→ Navigate to http://localhost:3000
→ Evaluate: performance.memory.usedJSHeapSize
Result: 12500000 (12.5MB - baseline)

# Step 2: Perform repeated actions
→ Click: [data-testid="open-modal"]
→ Click: [data-testid="close-modal"]
→ Repeat 10 times

# Step 3: Check memory after actions
→ Evaluate: performance.memory.usedJSHeapSize
Result: 45000000 (45MB - grew 32.5MB!)

# Step 4: Check for lingering elements
→ Evaluate: document.querySelectorAll('.modal').length
Result: 11 (memory leak found! Modals not being removed)

# Step 5: Check console for warnings
→ Read console warnings
Output: "Warning: Multiple instances of modal component mounted"

# Step 6: Investigate component lifecycle
→ Evaluate: document.querySelectorAll('.modal').forEach(el => console.log(el.dataset))
Result: Shows all modal instances with IDs

# Step 7: Test fix
→ Implement proper cleanup in component unmount
→ Reload page
→ Repeat open/close modal 10 times
→ Evaluate: performance.memory.usedJSHeapSize
Result: 14000000 (14MB - minimal growth, leak fixed!)
→ Evaluate: document.querySelectorAll('.modal').length
Result: 0 (when closed) or 1 (when open) - correct behavior
```

## Troubleshooting

### Common Browser Control Issues

**Issue: Cannot connect to browser**
```
Solution:
→ Verify browser MCP server is running
→ Check if browser is already open (close and retry)
→ Check firewall/security settings
→ Restart browser MCP server
→ Check MCP server logs for errors
```

**Issue: Page not loading**
```
Solution:
→ Check if URL is correct and accessible
→ Verify dev server is running (for localhost URLs)
→ Check network connectivity
→ Try loading in regular browser to isolate issue
→ Check console for navigation errors
```

**Issue: Actions not working (click, type, etc.)**
```
Solution:
→ Verify element exists: Query selector first
→ Check if element is visible: Get computed style: display
→ Check if element is enabled (not disabled)
→ Wait for page to fully load before interacting
→ Try evaluating JavaScript directly: Evaluate: document.querySelector('...').click()
```

### Console Debugging Issues

**Issue: Console logs not appearing**
```
Solution:
→ Verify console monitoring is started
→ Check if logs are being filtered out
→ Try different log levels (log, warn, error)
→ Verify code is actually running (check network requests)
→ Check if console is being cleared automatically
```

**Issue: Cannot evaluate expressions**
```
Solution:
→ Check syntax (valid JavaScript required)
→ Verify variables exist in page context
→ Use window.variableName for global variables
→ Check if content script context vs. page context
→ Try wrapping in try/catch: try { expression } catch(e) { console.error(e) }
```

**Issue: Error messages not helpful**
```
Solution:
→ Enable verbose error logging
→ Check source maps are loaded (for original code lines)
→ Look for full stack trace in console
→ Add console.log statements in code for more context
→ Use debugger; statement in code for breakpoint
```

### DOM Inspection Issues

**Issue: Element not found**
```
Solution:
→ Verify selector syntax is correct
→ Check if element is in shadow DOM (requires different approach)
→ Wait for dynamic content: setTimeout(() => query, 1000)
→ Check if element is in iframe (requires frame switching)
→ Verify element isn't dynamically generated later
→ Try broader selector first: Query all: div, then narrow down
```

**Issue: Multiple elements match selector**
```
Solution:
→ Use more specific selector (add classes, IDs, attributes)
→ Use :nth-of-type() or :first-child pseudo-selectors
→ Get all and filter: Evaluate: Array.from(document.querySelectorAll('...')).filter(...)
→ Add data-testid attributes for unique identification
```

**Issue: Element properties not as expected**
```
Solution:
→ Check computed styles (not inline styles): Get computed style
→ Verify element hasn't been modified by JavaScript
→ Check if CSS is loaded: Evaluate: document.styleSheets.length
→ Look for !important rules overriding styles
→ Check parent element styles (inheritance/flexbox/grid)
```

### Network Analysis Issues

**Issue: Requests not appearing in network log**
```
Solution:
→ Start monitoring before navigation/action
→ Clear network log and retry
→ Check if requests are cached (no network activity)
→ Verify requests are actually being made (check console)
→ Check if requests are blocked by ad blockers or extensions
```

**Issue: Cannot see request/response details**
```
Solution:
→ Ensure full network logging is enabled
→ Check CORS (may limit header visibility)
→ For localhost, verify dev server headers allow inspection
→ Try different request format (curl, Postman) to compare
→ Check if response is binary/compressed
```

**Issue: CORS errors blocking requests**
```
Solution:
→ Development: Configure dev server to allow CORS
→ Add appropriate headers: Access-Control-Allow-Origin
→ Use proxy in development to avoid CORS
→ Verify API server CORS configuration
→ Check preflight OPTIONS requests
```

### Performance Debugging Issues

**Issue: Performance metrics showing as undefined**
```
Solution:
→ Wait for page load: Evaluate: window.addEventListener('load', () => ...)
→ Use Navigation Timing API: Evaluate: performance.getEntriesByType('navigation')
→ Check browser support for API
→ Ensure HTTPS for some performance APIs
```

**Issue: Can't identify performance bottleneck**
```
Solution:
→ Measure systematically (network, then parsing, then runtime)
→ Use performance.mark() and performance.measure() in code
→ Check network waterfall for blocking resources
→ Look for long tasks in console
→ Profile memory usage over time
→ Use Chrome DevTools Performance panel manually
```

**Issue: Memory measurements inaccurate**
```
Solution:
→ Force garbage collection: Evaluate: gc() (if available)
→ Wait longer between measurements
→ Use multiple samples and average
→ Verify nothing else is running in browser
→ Close other tabs/windows
```

## When to Use This Skill

**Activate this skill when:**
- User is developing a web application (React, Vue, Svelte, etc.)
- User reports frontend bugs or issues
- User needs to test functionality in browser
- User wants to debug JavaScript errors
- User asks about console logs or network requests
- User needs to inspect or manipulate DOM elements
- User wants to test responsive design
- User needs performance analysis
- User asks about browser automation or testing
- User mentions local dev server (localhost)

**Key indicators:**
- Mentions of "console error", "not working in browser", "network request"
- Questions about "check the browser", "what's in the console", "inspect element"
- Debugging frontend issues: "button not clicking", "form not submitting"
- Performance questions: "page is slow", "memory leak", "loading time"
- Testing requests: "test responsive", "check on mobile", "verify functionality"
- Development workflow: "testing locally", "dev server", "hot reload"

**Decision flow:**
```
User request → Is it web development related?
             ↓
             Yes → Does it involve browser interaction/inspection?
             ↓
             Yes → Use Browser MCP skill
             ↓
             - Navigate to URL/localhost
             - Monitor console for errors
             - Inspect DOM elements
             - Check network requests
             - Test functionality
             - Debug issues
             - Capture evidence
             - Validate fixes
```

## Integration with Claude Code

When using this skill in Claude Code sessions:

### 1. Start Browser Connection
Always verify browser MCP connection at start of web development tasks:
```
→ Check if browser MCP server is available
→ Open browser if not already open
→ Navigate to application URL
```

### 2. Establish Development Loop
Create efficient workflow:
```
→ Open browser to localhost
→ Start console monitoring
→ Make code changes in editor
→ Browser auto-reloads (HMR/dev server)
→ Check console for errors
→ Verify changes visually
→ Test functionality
→ Repeat
```

### 3. Debug Systematically
When issues arise:
```
Step 1: Identify - Check console for errors
Step 2: Isolate - Inspect relevant DOM/network
Step 3: Investigate - Evaluate expressions to test hypotheses
Step 4: Document - Screenshot current state
Step 5: Fix - Update code
Step 6: Verify - Reload and test
Step 7: Capture - Screenshot fixed state
```

### 4. Provide Context
Always explain what you're doing:
```
"I'm checking the console for errors..."
"Inspecting the button element to verify its state..."
"The network request shows a 400 error, checking the payload..."
"Taking a screenshot to document this issue..."
```

### 5. Handle Errors Gracefully
When browser operations fail:
```
→ Report issue clearly: "Cannot find element with selector..."
→ Suggest alternatives: "Let's try a broader selector..."
→ Ask for clarification: "Can you verify the element is visible on the page?"
→ Provide debugging steps: "Let's check if the element exists first..."
```

### 6. Combine with File Operations
Integrate browser testing with code changes:
```
→ Read file to understand code
→ Identify potential issue
→ Open browser and test hypothesis
→ Confirm issue in browser
→ Edit file to fix
→ Refresh browser to verify
→ Confirm fix in console/network
```

### 7. Document and Report
Provide comprehensive feedback:
```
→ Summarize findings: "Found 3 console errors, all related to..."
→ Include evidence: "Screenshot attached showing the broken layout at 768px"
→ Explain root cause: "The API expects 'username' but we're sending 'email'"
→ Confirm resolution: "Fix verified - no console errors, network request succeeds"
```

### 8. Multi-Environment Testing
When testing across environments:
```
→ Open multiple tabs (dev, staging, production)
→ Test same functionality in each
→ Compare behavior and console output
→ Identify environment-specific issues
→ Document differences
```

### 9. Performance Monitoring
When analyzing performance:
```
→ Establish baseline measurements
→ Make optimization changes
→ Clear cache and reload
→ Measure again
→ Compare before/after metrics
→ Document improvement (or regression)
→ Provide specific numbers (not subjective "faster")
```

### 10. Clean Up
After browser operations:
```
→ Summarize all findings
→ Note any remaining issues
→ Close browser if session ending
→ Save screenshots to appropriate location
→ Document next steps if applicable
```

## Best Practice Checklist

Before any browser session:
- [ ] Verify browser MCP server is running
- [ ] Know the target URL (localhost:PORT or hosted)
- [ ] Understand what to test/debug
- [ ] Clear previous console/network logs

During browser session:
- [ ] Monitor console continuously
- [ ] Check network requests for API calls
- [ ] Inspect elements before manipulating
- [ ] Screenshot important states (errors, bugs, fixes)
- [ ] Test incrementally (small changes, frequent testing)
- [ ] Document issues as they're discovered

After making changes:
- [ ] Refresh page to load new code
- [ ] Verify no new console errors introduced
- [ ] Test the specific functionality changed
- [ ] Test related functionality (regression testing)
- [ ] Check network requests still succeed
- [ ] Capture screenshot of working state
- [ ] Document what was fixed and how

## Additional Resources

### Browser MCP Documentation
- Check MCP server configuration in settings.json
- Review browser MCP tool capabilities
- Understand security/permissions model

### Web Development Best Practices
- **MDN Web Docs**: https://developer.mozilla.org
- **Web.dev**: https://web.dev (Performance, best practices)
- **Can I Use**: https://caniuse.com (Browser compatibility)

### Debugging Techniques
- **Chrome DevTools**: https://developer.chrome.com/docs/devtools/
- **Firefox DevTools**: https://firefox-source-docs.mozilla.org/devtools-user/
- **Console API**: https://developer.mozilla.org/en-US/docs/Web/API/Console

### Performance Optimization
- **Web Performance**: https://web.dev/performance/
- **Navigation Timing**: https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API
- **Performance APIs**: https://developer.mozilla.org/en-US/docs/Web/API/Performance_API

### Testing Strategies
- **Testing Best Practices**: https://web.dev/testing/
- **Accessibility Testing**: https://www.w3.org/WAI/test-evaluate/
- **Responsive Design**: https://web.dev/responsive-web-design-basics/
